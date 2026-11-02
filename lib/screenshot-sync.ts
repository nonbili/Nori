import { previewKey, previewSource, type BookmarkPreview, type PreviewSource } from './bookmark-preview-types'

/**
 * Screenshots cannot be taken again on another device, unlike a page's cover image, so they are
 * the one kind of preview that syncs. The image is an object in the `nori-screenshots` bucket and
 * the bookmark's `json.screenshot` points at it, so the row's own sync carries the pointer.
 */
export interface ScreenshotRef {
  path: string
  /** The capture's `savedAt`: the newer of this and the local capture wins. */
  savedAt: number
  /** The page it shows. A bookmark edited to another URL keeps a pointer that no longer applies. */
  url: string
}

export interface ScreenshotBookmark {
  id: string
  url: string
  json?: Record<string, unknown> | null
}

export interface RemoteScreenshot {
  path: string
  createdAt: number
}

export interface ScreenshotStore {
  upload(path: string, image: Uint8Array): Promise<void>
  /** The image as a data URL, ready for `writePreview`. */
  download(path: string): Promise<string>
  list(userId: string): Promise<RemoteScreenshot[]>
  remove(paths: string[]): Promise<void>
}

export interface ScreenshotSyncHost {
  store: ScreenshotStore
  read(key: string): Promise<BookmarkPreview | undefined>
  write(key: string, preview: BookmarkPreview): Promise<void>
  /** The image at a preview's `imageUri`, made small enough for the bucket. */
  shrink(imageUri: string): Promise<Uint8Array>
  /** Saves the pointer on these bookmarks, which sync then carries to the other devices. */
  setRef(bookmarkIds: string[], ref: ScreenshotRef): void | Promise<void>
  /** A preview was replaced from the store, so whatever shows it should read it again. */
  changed(key: string): void
  newId(): string
}

export const SCREENSHOT_BUCKET = 'nori-screenshots'
export const SCREENSHOT_WIDTH = 640
export const SCREENSHOT_QUALITY = 0.7
export const SCREENSHOT_SIGNED_URL_SECONDS = 60
// An object may belong to a capture whose bookmark row has not reached this device yet, and a
// replaced one to a device that has not pulled the new pointer: both must outlive the wait.
const ORPHAN_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function screenshotRef(bookmark: ScreenshotBookmark): ScreenshotRef | undefined {
  const value = bookmark.json?.screenshot as Partial<ScreenshotRef> | null | undefined
  return typeof value?.path === 'string' &&
    Number.isFinite(value.savedAt) &&
    typeof value.url === 'string' &&
    value.url === bookmark.url
    ? (value as ScreenshotRef)
    : undefined
}

function isShownAsScreenshot(bookmark: ScreenshotBookmark, fallback: PreviewSource) {
  return previewSource(bookmark.json?.previewSource, fallback) === 'screenshot'
}

/** A saved screenshot this account may use. One with no owner is taken by the first to upload it. */
function ownImage(preview: BookmarkPreview | undefined, userId: string) {
  return preview?.imageUri && (!preview.owner || preview.owner === userId) ? preview : undefined
}

async function syncOne(userId: string, group: ScreenshotBookmark[], host: ScreenshotSyncHost) {
  const { url } = group[0]
  const key = previewKey(url, 'screenshot')
  const refs = group.map(screenshotRef).filter((ref) => ref !== undefined)
  const ref = refs.reduce<ScreenshotRef | undefined>((a, b) => (a && a.savedAt >= b.savedAt ? a : b), undefined)
  const local = await host.read(key)
  const localImage = ownImage(local, userId)

  if (localImage && (!ref || localImage.savedAt > ref.savedAt)) {
    const next = { path: `${userId}/${host.newId()}.jpg`, savedAt: localImage.savedAt, url }
    await host.store.upload(next.path, await host.shrink(localImage.imageUri))
    if (!localImage.owner) {
      // Unless a newer capture was saved during the upload: the next pass uploads that one.
      const latest = await host.read(key)
      if (latest?.savedAt === localImage.savedAt) await host.write(key, { ...latest, owner: userId })
    }
    await host.setRef(group.map((bookmark) => bookmark.id), next)
    return
  }
  if (!ref) return
  if (!localImage || ref.savedAt > localImage.savedAt) {
    const imageUri = await host.store.download(ref.path)
    // A capture saved while this was downloading is newer: the next pass uploads it.
    const latest = await host.read(key)
    const latestImage = ownImage(latest, userId)
    if (latestImage && latestImage.savedAt >= ref.savedAt) return
    await host.write(key, {
      description: latest?.description || '',
      imageUrl: latest?.imageUrl || '',
      imageUri,
      savedAt: ref.savedAt,
      owner: userId,
    })
    host.changed(key)
  }
  // Two bookmarks of one page share a local screenshot, so they share the pointer too.
  const behind = group.filter((bookmark) => screenshotRef(bookmark)?.path !== ref.path)
  if (behind.length) await host.setRef(behind.map((bookmark) => bookmark.id), ref)
}

/**
 * Uploads this device's newer screenshots and downloads the ones it lacks, for the bookmarks shown
 * as screenshots. One failure only skips its page: the next pass tries it again, and the local
 * image is untouched until a replacement has been fully downloaded.
 */
export async function syncScreenshots(
  userId: string,
  bookmarks: ScreenshotBookmark[],
  fallback: PreviewSource,
  host: ScreenshotSyncHost,
) {
  const groups = new Map<string, ScreenshotBookmark[]>()
  for (const bookmark of bookmarks) {
    if (bookmark.json?.deleted_at || !isShownAsScreenshot(bookmark, fallback)) continue
    const group = groups.get(bookmark.url)
    if (group) group.push(bookmark)
    else groups.set(bookmark.url, [bookmark])
  }
  for (const group of groups.values()) {
    try {
      await syncOne(userId, group, host)
    } catch {}
  }
}

/**
 * Removes this account's objects that no bookmark points at. Pass every row including tombstones,
 * from a state just pulled: Undo brings a deleted bookmark's pointer back.
 */
export async function removeOrphanedScreenshots(
  userId: string,
  bookmarks: ScreenshotBookmark[],
  store: ScreenshotStore,
  now = Date.now(),
) {
  const referenced = new Set<string>()
  for (const bookmark of bookmarks) {
    const value = bookmark.json?.screenshot as Partial<ScreenshotRef> | null | undefined
    if (typeof value?.path === 'string') referenced.add(value.path)
  }
  const orphans = (await store.list(userId))
    .filter((object) => !referenced.has(object.path) && now - object.createdAt >= ORPHAN_AGE_MS)
    .map((object) => object.path)
  if (orphans.length) await store.remove(orphans)
}

interface Bucket {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ error: unknown }>
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>
  list(
    folder: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: { name: string; created_at?: string | null }[] | null; error: unknown }>
  remove(paths: string[]): Promise<{ error: unknown }>
}

export function createScreenshotStore(bucket: Bucket, fetchImage: (url: string) => Promise<string>): ScreenshotStore {
  const LIST_PAGE = 1000
  return {
    async upload(path, image) {
      const { error } = await bucket.upload(path, image, { contentType: 'image/jpeg', upsert: false })
      if (error) throw error
    },
    async download(path) {
      const { data, error } = await bucket.createSignedUrl(path, SCREENSHOT_SIGNED_URL_SECONDS)
      if (error || !data) throw error ?? new Error('screenshot_download_failed')
      return fetchImage(data.signedUrl)
    },
    async list(userId) {
      const objects: RemoteScreenshot[] = []
      for (let offset = 0; ; offset += LIST_PAGE) {
        const { data, error } = await bucket.list(userId, { limit: LIST_PAGE, offset })
        if (error) throw error
        for (const file of data || []) {
          // No date reads as brand new, so an object is never removed on a guess.
          objects.push({ path: `${userId}/${file.name}`, createdAt: Date.parse(file.created_at || '') || Date.now() })
        }
        if ((data?.length || 0) < LIST_PAGE) return objects
      }
    },
    async remove(paths) {
      const { error } = await bucket.remove(paths)
      if (error) throw error
    },
  }
}

/** Runs one pass at a time. A request during a pass runs one more after it, not alongside it. */
export function singlePass(run: () => Promise<void>) {
  let running = false
  let again = false
  return async () => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        await run()
      } while (again)
    } catch {
      // The next sync tries again.
    } finally {
      running = false
    }
  }
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
