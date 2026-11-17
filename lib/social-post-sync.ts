import type { BookmarkPreview } from './bookmark-preview-types'
import type { ScreenshotBookmark } from './screenshot-sync'
import { MAX_POST_ASSETS, postAssets, socialAssetKey, socialKey, validSocialPost, type SavedPost } from './social-post'
import { cleanPost, SAVED_POST_VERSION, SOCIAL_ORPHAN_AGE_MS, SavedPostNotFoundError, validSaveId, type PrivateSocialPost, type SocialPostStore } from './social-post-store'

/** A reference to an immutable capture in the saving account's private database. */
export interface SocialPostRef { postId: string; savedAt: number; url: string }
export interface SocialPostSyncHost {
  store: SocialPostStore
  newId(): string
  readImage(uri: string): Promise<string>
  read(key: string): Promise<BookmarkPreview | undefined>
  write(key: string, preview: BookmarkPreview): Promise<void>
  setRef(bookmarkIds: string[], ref: SocialPostRef): void | Promise<void>
  changed(key: string): void
  isCurrent(): boolean
}

const localLocks = new Map<string, Promise<unknown>>()
/** Serializes a save and a download of the same URL across web contexts, or in native JS. */
export function withSavedPostLock<T>(url: string, run: () => Promise<T>): Promise<T> {
  const name = socialKey(url)
  const locks = (globalThis.navigator as Navigator | undefined)?.locks
  if (locks) return locks.request(name, run)
  const next = (localLocks.get(name) ?? Promise.resolve()).then(run, run)
  const settled = next.catch(() => undefined)
  localLocks.set(name, settled)
  void settled.then(() => { if (localLocks.get(name) === settled) localLocks.delete(name) })
  return next
}

export async function readSavedPostFrom(read: SocialPostSyncHost['read'], url: string, owner: string) {
  const saved = (await read(socialKey(url)))?.savedPost
  return saved?.owner === owner ? saved : undefined
}

function postRef(bookmark: ScreenshotBookmark): SocialPostRef | undefined {
  const ref = bookmark.json?.socialPost as Partial<SocialPostRef> | undefined
  return validSaveId(ref?.postId) && typeof ref.savedAt === 'number' && Number.isFinite(ref.savedAt) &&
    ref.savedAt >= 0 && ref.url === bookmark.url ? ref as SocialPostRef : undefined
}

async function upload(userId: string, url: string, local: SavedPost, host: SocialPostSyncHost) {
  // Copy the post and all locally archived bytes under the same lock as a new capture.
  const staged = await withSavedPostLock(url, async () => {
    const latest = await readSavedPostFrom(host.read, url, userId)
    if (!host.isCurrent() || !latest || latest.savedAt !== local.savedAt || !validSocialPost(latest.post)) return
    const post = cleanPost(latest.post)
    const assets = postAssets(post)
    if (assets.length > MAX_POST_ASSETS) throw new Error('invalid_social_post')
    const images: string[] = []
    for (const index of assets.keys()) {
      const image = await host.read(socialAssetKey(url, index))
      if (!image?.imageUri || image.owner !== userId || image.savedAt !== local.savedAt) throw new Error('missing_saved_post_media')
      images.push(await host.readImage(image.imageUri))
    }
    return { post, images }
  })
  if (!staged || !host.isCurrent()) return
  const id = host.newId()
  await host.store.save({ id, version: SAVED_POST_VERSION, capturedAt: local.savedAt, post: staged.post }, staged.images)
  await withSavedPostLock(url, async () => {
    const latest = await readSavedPostFrom(host.read, url, userId)
    if (!host.isCurrent() || !latest || latest.savedAt !== local.savedAt) return
    const preview = await host.read(socialKey(url))
    if (!preview || !host.isCurrent()) return
    await host.write(socialKey(url), { ...preview, savedPost: { ...latest, postId: id } })
  })
  return id
}

async function install(userId: string, url: string, ref: SocialPostRef, value: PrivateSocialPost, host: SocialPostSyncHost) {
  if (value.id !== ref.postId || value.version !== SAVED_POST_VERSION || value.capturedAt !== ref.savedAt ||
    !validSocialPost(value.post) || postAssets(value.post).length > MAX_POST_ASSETS) throw new Error('invalid_saved_post')
  const post = cleanPost(value.post)
  const images: string[] = []
  for (const index of postAssets(post).keys()) {
    if (!host.isCurrent()) return false
    images.push(await host.store.image(value.id, index))
  }
  return withSavedPostLock(url, async () => {
    const latest = await readSavedPostFrom(host.read, url, userId)
    if (!host.isCurrent() || (latest && latest.savedAt > ref.savedAt)) return false
    for (const [index, asset] of postAssets(post).entries()) {
      if (!host.isCurrent()) return false
      asset.cacheKey = socialAssetKey(url, index)
      await host.write(asset.cacheKey, { description: '', imageUrl: asset.url, imageUri: images[index], savedAt: ref.savedAt, owner: userId })
    }
    if (!host.isCurrent()) return false
    const saved: SavedPost = { post, savedAt: ref.savedAt, owner: userId, postId: value.id }
    await host.write(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: ref.savedAt, owner: userId, savedPost: saved })
    host.changed(socialKey(url))
    return true
  })
}

async function clearCloudRef(userId: string, url: string, local: SavedPost, host: SocialPostSyncHost) {
  await withSavedPostLock(url, async () => {
    const preview = await host.read(socialKey(url))
    const latest = preview?.savedPost
    if (!host.isCurrent() || !latest || latest.owner !== userId || latest.savedAt !== local.savedAt || latest.postId !== local.postId) return
    const { postId: _postId, ...capture } = latest
    await host.write(socialKey(url), { ...preview!, savedPost: capture })
  })
}

async function uploadOrReuse(userId: string, url: string, local: SavedPost, host: SocialPostSyncHost) {
  if (validSaveId(local.postId)) {
    try {
      const value = await host.store.get(local.postId)
      if (value.id !== local.postId || value.version !== SAVED_POST_VERSION || value.capturedAt !== local.savedAt) throw new Error('invalid_saved_post')
      // An unpublished old row can be selected by concurrent cleanup on another device.
      // Reuse only a recent, server-dated row with a full day left before it becomes eligible.
      const age = value.createdAt === undefined ? Infinity : Date.now() - value.createdAt
      if (age >= 0 && age < SOCIAL_ORPHAN_AGE_MS - 24 * 60 * 60 * 1000) return local.postId
    } catch (error) {
      if (!(error instanceof SavedPostNotFoundError)) throw error
    }
    await clearCloudRef(userId, url, local, host)
  }
  return upload(userId, url, local, host)
}

/** Upload local captures and download referenced private captures. No provider retrieval happens here. */
export async function syncSocialPosts(userId: string, bookmarks: ScreenshotBookmark[], host: SocialPostSyncHost) {
  const groups = new Map<string, ScreenshotBookmark[]>()
  for (const bookmark of bookmarks) {
    if (bookmark.json?.deleted_at) continue
    const group = groups.get(bookmark.url)
    if (group) group.push(bookmark)
    else groups.set(bookmark.url, [bookmark])
  }
  for (const [url, group] of groups) {
    if (!host.isCurrent()) return
    try {
      const local = await readSavedPostFrom(host.read, url, userId)
      const ref = group.map(postRef).reduce<SocialPostRef | undefined>((a, b) => a && (!b || a.savedAt >= b.savedAt) ? a : b, undefined)
      let nextRef = ref
      if (local && (!ref || local.savedAt > ref.savedAt)) {
        // Reuse a completed upload if publishing its bookmark reference failed last time.
        const id = await uploadOrReuse(userId, url, local, host)
        const latest = await readSavedPostFrom(host.read, url, userId)
        if (!id || !latest || latest.savedAt !== local.savedAt || !host.isCurrent()) continue
        nextRef = { postId: id, savedAt: local.savedAt, url }
      } else if (ref) {
        let value: PrivateSocialPost | undefined
        try {
          value = await host.store.get(ref.postId)
          if (value.id !== ref.postId || value.version !== SAVED_POST_VERSION || value.capturedAt !== ref.savedAt) throw new Error('invalid_saved_post')
        } catch (error) {
          if (!(error instanceof SavedPostNotFoundError) || !local || local.savedAt !== ref.savedAt) throw error
          // An offline device may have lost its unpublished cloud row to orphan cleanup.
          // Recover only that exact capture from its complete, account-owned local bytes.
          await clearCloudRef(userId, url, local, host)
          const id = await upload(userId, url, local, host)
          const latest = await readSavedPostFrom(host.read, url, userId)
          if (!id || !latest || latest.savedAt !== ref.savedAt || !host.isCurrent()) continue
          nextRef = { ...ref, postId: id }
        }
        if (value && (!local || local.savedAt < ref.savedAt || local.postId !== ref.postId)) {
          if (!await install(userId, url, ref, value, host)) continue
        }
      }
      if (nextRef && host.isCurrent()) {
        const behind = group.filter((bookmark) => postRef(bookmark)?.postId !== nextRef.postId || postRef(bookmark)?.savedAt !== nextRef.savedAt)
        if (behind.length) await host.setRef(behind.map((bookmark) => bookmark.id), nextRef)
      }
    } catch (error) { console.warn('Post sync failed', error) }
  }
}
