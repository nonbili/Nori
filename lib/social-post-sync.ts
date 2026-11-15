import { fetchWithTimeout } from './fetch-with-timeout'
import type { BookmarkPreview } from './bookmark-preview-types'
import { base64ToBytes, bytesToBase64, screenshotRef, type ScreenshotBookmark, type ScreenshotRef } from './screenshot-sync'
import { MAX_POST_ASSETS, postAssets, socialAssetKey, socialKey, validSocialPost, type SavedPost } from './social-post'

/**
 * A saved post's archive is an object in the `nori-posts` bucket, `<user id>/<random id>.json`, and
 * the bookmark's `json.socialPost` points at it, so the row's own sync carries the pointer. Only Sync
 * accounts reach this: without a plan, saved posts stay on the device.
 */
export type SocialPostRef = ScreenshotRef

// Bump when the layout changes, e.g. to images shared across users and referenced by hash. A client
// that does not know a version leaves the local copy alone, and an upgraded client reads it.
const ARCHIVE_VERSION = 1
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
const SIGNED_URL_SECONDS = 60
const DOWNLOAD_TIMEOUT_MS = 60_000

interface Archive {
  v: typeof ARCHIVE_VERSION
  saved: SavedPost
  /** One JPEG data URL per `postAssets(saved.post)` entry, in order. */
  images: string[]
}

export interface ArchiveBucket {
  upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>
}

export interface SocialPostSyncHost {
  bucket: ArchiveBucket
  read(key: string): Promise<BookmarkPreview | undefined>
  write(key: string, preview: BookmarkPreview): Promise<void>
  /** The image at a preview's `imageUri`, as a small JPEG. */
  shrink(imageUri: string): Promise<Uint8Array>
  /** Saves the pointer on these bookmarks, which sync then carries to the other devices. */
  setRef(bookmarkIds: string[], ref: SocialPostRef): void | Promise<void>
  /** A saved post was replaced from the bucket, so whatever shows it should read it again. */
  changed(key: string): void
  /** False once the account changed: what this pass fetched is not the next account's. */
  isCurrent(): boolean
  newId(): string
}

const localLocks = new Map<string, Promise<unknown>>()
/**
 * Runs one change of a URL's saved post at a time, so a save and a download never interleave their
 * image writes. Web Locks cover the extension's pages and its background worker together; native
 * has a single JS context, where an in-memory queue does.
 */
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

function postRef(bookmark: ScreenshotBookmark, userId: string) {
  const ref = screenshotRef({ ...bookmark, json: { screenshot: bookmark.json?.socialPost } })
  return ref?.path.startsWith(`${userId}/`) ? ref : undefined
}

async function upload(userId: string, ids: string[], url: string, local: SavedPost, host: SocialPostSyncHost) {
  // Under the lock, so a save meanwhile cannot mix its images into this post's archive (or, on
  // native, delete an image file while it is being read).
  const images = await withSavedPostLock(url, async () => {
    const latest = await readSavedPostFrom(host.read, url, userId)
    // Saved again since: the next pass uploads that one.
    if (latest?.savedAt !== local.savedAt) return
    const result: string[] = []
    for (const item of postAssets(latest.post)) {
      const preview = item.cacheKey ? await host.read(item.cacheKey) : undefined
      if (!preview?.imageUri || preview.owner !== userId || preview.savedAt !== local.savedAt) throw new Error('social_image_missing')
      result.push(`data:image/jpeg;base64,${bytesToBase64(await host.shrink(preview.imageUri))}`)
    }
    return result
  })
  if (!images || !host.isCurrent()) return
  const path = `${userId}/${host.newId()}.json`
  const bytes = new TextEncoder().encode(JSON.stringify({ v: ARCHIVE_VERSION, saved: local, images } satisfies Archive))
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('social_post_too_large')
  const { error } = await host.bucket.upload(path, bytes, { contentType: 'application/json', upsert: false })
  if (error) throw error
  if (host.isCurrent()) await host.setRef(ids, { path, savedAt: local.savedAt, url })
}

async function download(userId: string, url: string, ref: SocialPostRef, host: SocialPostSyncHost) {
  const { data, error } = await host.bucket.createSignedUrl(ref.path, SIGNED_URL_SECONDS)
  if (error || !data) throw error || new Error('social_download_failed')
  // Bounded, headers and body: a stalled download would hold up every later post in the pass.
  const response = await fetchWithTimeout(data.signedUrl, {}, DOWNLOAD_TIMEOUT_MS)
  if (!response.ok) throw new Error('social_download_failed')
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error('social_post_too_large')
  const { v, saved, images } = JSON.parse(new TextDecoder().decode(buffer)) as Archive
  if (v !== ARCHIVE_VERSION) throw new Error('unsupported_social_archive')
  if (saved?.owner !== userId || saved.savedAt !== ref.savedAt || !validSocialPost(saved.post) || !Array.isArray(images))
    throw new Error('invalid_social_archive')
  const items = postAssets(saved.post)
  if (items.length !== images.length || items.length > MAX_POST_ASSETS) throw new Error('invalid_social_archive')
  // Validate every image before replacing anything. Only JPEG data URLs are accepted, so a
  // remote archive can never make the device fetch a URL.
  for (const image of images) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('invalid_social_image')
    base64ToBytes(image.split(',')[1])
  }
  const installed = await withSavedPostLock(url, async () => {
    // A post saved here while this was downloading is newer: the next pass uploads it.
    const latest = await readSavedPostFrom(host.read, url, userId)
    if (latest && latest.savedAt >= saved.savedAt) return false
    for (const [index, item] of items.entries()) {
      if (!host.isCurrent()) return false
      item.cacheKey = socialAssetKey(url, index)
      await host.write(item.cacheKey, { description: '', imageUrl: item.url, imageUri: images[index], savedAt: saved.savedAt, owner: userId })
    }
    if (!host.isCurrent()) return false
    await host.write(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: saved.savedAt, owner: userId, savedPost: saved })
    return true
  })
  if (installed) host.changed(socialKey(url))
}

/**
 * Uploads this device's newer saved posts and downloads the ones it lacks. The local archive is
 * per URL, so bookmarks of one URL share it and its pointer. One failure only skips its post.
 */
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
      const ref = group.map((bookmark) => postRef(bookmark, userId))
        .reduce<SocialPostRef | undefined>((a, b) => (a && (!b || a.savedAt >= b.savedAt) ? a : b), undefined)
      const ids = group.map((bookmark) => bookmark.id)
      if (local && (!ref || local.savedAt > ref.savedAt)) await upload(userId, ids, url, local, host)
      else if (ref && (!local || ref.savedAt > local.savedAt)) await download(userId, url, ref, host)
      else if (ref) {
        const behind = group.filter((bookmark) => postRef(bookmark, userId)?.path !== ref.path)
        if (behind.length) await host.setRef(behind.map((bookmark) => bookmark.id), ref)
      }
    } catch (error) {
      console.warn('Post sync failed', error)
    }
  }
}
