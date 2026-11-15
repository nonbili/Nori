import type { PostResponse } from './sns-schema'
import type { BookmarkPreview } from './bookmark-preview-types'
import type { ScreenshotBookmark } from './screenshot-sync'
import { MAX_POST_ASSETS, postAssets, socialAssetKey, socialKey, validSocialPost, type SavedPost, type SocialMedia, type SocialPost } from './social-post'

/** Personal save intent points at one shared current database row, never an object-storage path. */
export interface SocialPostRef { postId: string; savedAt: number; url: string }
export interface SharedSocialPost { postId: string; fetchedAt: string; post: SocialPost; remote?: PostResponse }
export interface SocialPostSyncHost {
  save(url: string): Promise<SharedSocialPost>
  get(id: string): Promise<SharedSocialPost>
  image(asset: SocialMedia): Promise<string>
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
  return typeof ref?.postId === 'string' && /^[a-f0-9]{64}$/.test(ref.postId) &&
    typeof ref.savedAt === 'number' && Number.isFinite(ref.savedAt) && ref.savedAt >= 0 && ref.url === bookmark.url
    ? ref as SocialPostRef : undefined
}

async function install(userId: string, url: string, savedAt: number, value: SharedSocialPost, host: SocialPostSyncHost) {
  if (!/^[a-f0-9]{64}$/.test(value.postId) || !Number.isFinite(Date.parse(value.fetchedAt)) || !validSocialPost(value.post))
    throw new Error('invalid_social_post')
  const items = postAssets(value.post)
  if (items.length > MAX_POST_ASSETS) throw new Error('invalid_social_post')
  const images: string[] = []
  for (const [index, item] of items.entries()) {
    if (!host.isCurrent()) return false
    const cached = await host.read(socialAssetKey(url, index))
    images.push(cached?.owner === userId && cached.imageUrl === item.url && cached.imageUri ? cached.imageUri : await host.image(item))
  }
  return withSavedPostLock(url, async () => {
    const latest = await readSavedPostFrom(host.read, url, userId)
    if (!host.isCurrent() || (latest && latest.savedAt > savedAt) ||
      (latest?.postId === value.postId && Date.parse(latest.fetchedAt || '') > Date.parse(value.fetchedAt))) return false
    for (const [index, item] of items.entries()) {
      if (!host.isCurrent()) return false
      item.cacheKey = socialAssetKey(url, index)
      await host.write(item.cacheKey, { description: '', imageUrl: item.url, imageUri: images[index], savedAt, owner: userId })
    }
    if (!host.isCurrent()) return false
    const saved: SavedPost = { post: value.post, savedAt, owner: userId, postId: value.postId, fetchedAt: value.fetchedAt, remote: value.remote }
    await host.write(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt, owner: userId, savedPost: saved })
    host.changed(socialKey(url))
    return true
  })
}

/** Reads the shared row every pass so edits reach devices without changing personal bookmark refs. */
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
      if (local && (!ref || local.savedAt > ref.savedAt)) {
        const value = await host.save(url) // Only a URL; local JSON and images never leave the device.
        if (!await install(userId, url, local.savedAt, value, host)) continue
        if (host.isCurrent()) await host.setRef(group.map((item) => item.id), { postId: value.postId, savedAt: local.savedAt, url })
      } else if (ref) {
        let nextRef = ref
        let value: SharedSocialPost
        try {
          value = await host.get(ref.postId)
          if (value.postId !== ref.postId) throw new Error('invalid_social_post')
        } catch (error) {
          if (!(error instanceof Error) || !('status' in error) || error.status !== 404) throw error
          if (!host.isCurrent()) return
          value = await host.save(url) // A merged/imported ref carries intent, never the old owner's grant.
          nextRef = { ...ref, postId: value.postId }
        }
        if (!local || local.savedAt < ref.savedAt || local.postId !== value.postId || !local.fetchedAt ||
          Date.parse(value.fetchedAt) > Date.parse(local.fetchedAt)) {
          if (!await install(userId, url, ref.savedAt, value, host)) continue
        }
        const behind = group.filter((bookmark) => postRef(bookmark)?.postId !== nextRef.postId || postRef(bookmark)?.savedAt !== nextRef.savedAt)
        if (behind.length && host.isCurrent()) await host.setRef(behind.map((bookmark) => bookmark.id), nextRef)
      }
    } catch (error) { console.warn('Post sync failed', error) }
  }
}
