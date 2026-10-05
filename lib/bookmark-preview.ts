import { fetchPreviewImage } from './preview-image'
import { getPreviewMeta } from './bookmark'
import { readPreview, writePreview, prunePreviews } from './bookmark-preview-storage'
import {
  blockedPreviewStatus,
  previewKey,
  PreviewResponseError,
  type BookmarkPreview,
  type PreviewSource,
} from './bookmark-preview-types'

export { previewSource, type PreviewSource, type BookmarkPreview } from './bookmark-preview-types'
const FAILURE_RETRY_MS = 60 * 60 * 1000
const NETWORK_RETRY_MS = 10000
function retryAt(error: unknown) {
  return Date.now() + (error instanceof PreviewResponseError && error.persistent ? FAILURE_RETRY_MS : NETWORK_RETRY_MS)
}
let capture: ((url: string) => Promise<string>) | undefined
let imageFetch: (url: string, signal?: AbortSignal) => Promise<string> = fetchPreviewImage
export function setPreviewCapture(handler: typeof capture) {
  capture = handler
}
export function setPreviewImageFetch(handler: typeof imageFetch) {
  imageFetch = handler
}
// Native only: reads the same metadata from a page rendered in a hidden WebView,
// for sites whose bot protection rejects the plain fetch.
let renderedMeta:
  | ((url: string, signal: AbortSignal) => Promise<{ description: string; imageUrl: string } | null>)
  | undefined
export function setPreviewRenderedMeta(handler: typeof renderedMeta) {
  renderedMeta = handler
}

interface Job {
  key: string
  manual: boolean
  promise: Promise<BookmarkPreview>
  resolve: (preview: BookmarkPreview) => void
  reject: (error: unknown) => void
  controller: AbortController
  consumers: Set<symbol>
  keepAlive: boolean
  run: () => Promise<BookmarkPreview>
}
const pending = new Map<string, Job>()
const automaticQueue: Job[] = []
const manualQueue: Job[] = []
let automaticRunning = 0
let manualRunning = 0
const listeners = new Set<(key: string) => void>()
let liveKeys: Set<string> | undefined
let bookmarkKeys: Set<string> | undefined
const editorKeys = new Map<symbol, Set<string>>()
let pruning = Promise.resolve()
let pruningScheduled = false

function keysForUrls(urls: string[]) {
  const next = new Set<string>()
  for (const url of urls) {
    try {
      next.add(previewKey(url, 'page-image'))
      next.add(previewKey(url, 'screenshot'))
    } catch {}
  }
  return next
}
function schedulePruning() {
  if (!bookmarkKeys) return pruning
  const next = new Set(bookmarkKeys)
  for (const keys of editorKeys.values()) for (const key of keys) next.add(key)
  if (liveKeys && liveKeys.size === next.size && [...next].every((key) => liveKeys!.has(key))) return pruning
  liveKeys = next
  for (const [key, job] of pending) if (!next.has(key)) job.controller.abort()
  // Coalesce URL edits/sync bursts rather than pruning every intermediate set.
  if (!pruningScheduled) {
    pruningScheduled = true
    pruning = pruning
      .catch(() => {})
      .then(async () => {
        try {
          let pruned: Set<string>
          do {
            pruned = liveKeys!
            await prunePreviews(pruned)
          } while (pruned !== liveKeys)
        } finally {
          pruningScheduled = false
        }
      })
  }
  return pruning
}
export function updatePreviewBookmarks(urls: string[]) {
  bookmarkKeys = keysForUrls(urls)
  return schedulePruning()
}
// A new or edited URL can be previewed before Save. Keep it only while its
// editor is open; closing an unsaved editor removes the temporary cache entry.
export function retainEditorPreview(url: string) {
  const token = Symbol()
  editorKeys.set(token, keysForUrls([url]))
  void schedulePruning().catch(() => {})
  return () => {
    editorKeys.delete(token)
    void schedulePruning().catch(() => {})
  }
}

function abortError() {
  const error = new Error('preview_cancelled')
  error.name = 'AbortError'
  return error
}
function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw abortError()
}

// Two automatic workers and a separate manual lane. Cancelled queued tiles are
// removed immediately; a user refresh never waits behind a scrolling backlog.
function pump(manual: boolean) {
  const queue = manual ? manualQueue : automaticQueue
  while (queue.length && (manual ? manualRunning < 1 : automaticRunning < 2)) {
    const job = queue.shift()!
    if (job.controller.signal.aborted) continue
    if (manual) manualRunning++
    else automaticRunning++
    void job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        if (manual) manualRunning--
        else automaticRunning--
        pump(manual)
      })
  }
}

function subscribe(job: Job, signal?: AbortSignal) {
  if (!signal) {
    job.keepAlive = true
    return job.promise
  }
  if (signal.aborted) {
    if (!job.keepAlive && !job.consumers.size) job.controller.abort()
    return Promise.reject(abortError())
  }
  const consumer = Symbol()
  job.consumers.add(consumer)
  return new Promise<BookmarkPreview>((resolve, reject) => {
    const abort = () => {
      job.consumers.delete(consumer)
      if (!job.keepAlive && !job.consumers.size) job.controller.abort()
      reject(abortError())
    }
    signal.addEventListener('abort', abort, { once: true })
    void job.promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort)
      job.consumers.delete(consumer)
    })
  })
}

export function onPreviewChange(listener: (key: string) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadBookmarkPreview(
  url: string,
  source: PreviewSource,
  refresh = false,
  options: { signal?: AbortSignal } = {},
): Promise<BookmarkPreview> {
  let key: string
  try {
    key = previewKey(url, source)
  } catch (error) {
    return Promise.reject(error)
  }
  if (liveKeys && !liveKeys.has(key)) return Promise.reject(abortError())
  const existing = pending.get(key)
  if (existing) {
    if (!refresh || existing.manual) return subscribe(existing, options.signal)
    // Retry even when the initial load failed. Promote the explicit request by
    // cancelling its automatic predecessor, including one still in the queue.
    existing.controller.abort()
    return existing.promise.catch(() => {}).then(() => loadBookmarkPreview(url, source, true, options))
  }
  if (options.signal?.aborted) return Promise.reject(abortError())

  let resolve!: Job['resolve'], reject!: Job['reject']
  const promise = new Promise<BookmarkPreview>((done, fail) => {
    resolve = done
    reject = fail
  })
  const controller = new AbortController()
  const signal = controller.signal
  let cached: BookmarkPreview | undefined
  const job: Job = {
    key,
    manual: refresh,
    promise,
    resolve,
    reject,
    controller,
    consumers: new Set(),
    keepAlive: false,
    run: async () => {
      checkCancelled(signal)
      let meta!: { description: string; imageUrl: string }
      let retryAfter: number | undefined
      try {
        meta = await getPreviewMeta(url, signal)
      } catch (error) {
        checkCancelled(signal)
        const rendered =
          renderedMeta && error instanceof PreviewResponseError && blockedPreviewStatus(error.status)
            ? await renderedMeta(url, signal).catch(() => null)
            : null
        checkCancelled(signal)
        if (rendered) {
          meta = rendered
        } else {
          if (refresh && source !== 'screenshot') throw error
          meta = { description: cached?.description || '', imageUrl: cached?.imageUrl || '' }
          if (!refresh) retryAfter = retryAt(error)
        }
      }
      checkCancelled(signal)
      let imageUri = ''
      if (source === 'screenshot' && refresh) {
        if (!capture) throw new Error('preview_capture_unavailable')
        imageUri = await capture(url)
      } else if (source === 'page-image' && meta.imageUrl && !retryAfter) {
        try {
          imageUri = await imageFetch(meta.imageUrl, signal)
        } catch (error) {
          checkCancelled(signal)
          if (refresh) throw error
          retryAfter = retryAt(error)
        }
      }
      checkCancelled(signal)
      const preview: BookmarkPreview = {
        ...meta,
        imageUri: imageUri || (retryAfter ? cached?.imageUri || '' : ''),
        savedAt: Date.now(),
        ...(retryAfter ? { retryAfter } : {}),
      }
      await writePreview(key, preview)
      checkCancelled(signal)
      const saved = await readPreview(key)
      if (!saved) throw new Error('preview_cache_failed')
      listeners.forEach((listener) => listener(key))
      return saved
    },
  }
  pending.set(key, job)
  signal.addEventListener(
    'abort',
    () => {
      const queue = refresh ? manualQueue : automaticQueue
      const index = queue.indexOf(job)
      if (index !== -1) queue.splice(index, 1)
      reject(abortError())
    },
    { once: true },
  )
  void promise.then(
    () => {
      if (pending.get(key) === job) pending.delete(key)
    },
    () => {
      if (pending.get(key) === job) pending.delete(key)
      // A refresh superseded the tile's automatic request. Let it recover from
      // the preserved cache (or retry automatically) even if refresh failed.
      if (refresh && !signal.aborted) listeners.forEach((listener) => listener(key))
    },
  )
  void (async () => {
    cached = await readPreview(key)
    checkCancelled(signal)
    if (cached && !refresh && (!cached.retryAfter || cached.retryAfter > Date.now())) {
      resolve(cached)
      return
    }
    const queue = refresh ? manualQueue : automaticQueue
    queue.push(job)
    pump(refresh)
  })().catch(reject)
  return subscribe(job, options.signal)
}

export function getCachedBookmarkPreview(url: string, source: PreviewSource) {
  return readPreview(previewKey(url, source))
}
