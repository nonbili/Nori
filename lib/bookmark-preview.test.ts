import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'bun:test'
import { setPageFetch, getPreviewMeta } from './bookmark'
import {
  loadBookmarkPreview,
  setPreviewCapture,
  setPreviewImageFetch,
  setPreviewRenderedMeta,
  onPreviewChange,
  updatePreviewBookmarks,
  retainEditorPreview,
} from './bookmark-preview'
import { previewKey, previewSource } from './bookmark-preview-types'
import { readPreview, writePreview } from './bookmark-preview-storage'

const html = '<meta property="og:description" content=" Saved article "><meta property="og:image" content="/cover.jpg">'
afterEach(() => {
  setPageFetch((url, init) => fetch(url, { ...init, redirect: 'follow' }))
  setPreviewCapture(undefined)
})

describe('bookmark previews', () => {
  it('extracts a description and resolves an image against the final redirected page', async () => {
    setPageFetch(async () => {
      const response = new Response(html)
      Object.defineProperty(response, 'url', { value: 'https://final.example/article' })
      return response
    })
    expect(await getPreviewMeta('https://original.example')).toEqual({
      description: 'Saved article',
      imageUrl: 'https://final.example/cover.jpg',
    })
  })
  it('decodes the page bytes itself rather than trusting the response text()', async () => {
    setPageFetch(async () => {
      const response = new Response(new TextEncoder().encode('<meta name="description" content="歌詞を検索">'))
      response.text = async () => 'garbled'
      return response
    })
    expect((await getPreviewMeta('https://utf8.example')).description).toBe('歌詞を検索')
  })
  it('uses rendered metadata when the page fetch is blocked, but not for a missing page', async () => {
    const rendered: string[] = []
    setPreviewRenderedMeta(async (url) => {
      rendered.push(url)
      return { description: 'Rendered', imageUrl: '' }
    })
    try {
      setPageFetch(async () => new Response('denied', { status: 401 }))
      const blocked = await loadBookmarkPreview('https://blocked.example', 'page-image')
      expect(blocked.description).toBe('Rendered')
      expect(blocked.retryAfter).toBeUndefined()
      setPageFetch(async () => new Response('gone', { status: 404 }))
      const missing = await loadBookmarkPreview('https://missing.example', 'page-image')
      expect(missing.description).toBe('')
      expect(rendered).toEqual(['https://blocked.example'])
    } finally {
      setPreviewRenderedMeta(undefined)
    }
  })
  it('keeps Latin-1 text when the runtime decoder only knows UTF-8', async () => {
    const NativeDecoder = globalThis.TextDecoder
    // Mirrors Hermes: any label other than UTF-8 is rejected.
    globalThis.TextDecoder = class extends NativeDecoder {
      constructor(label = 'utf-8') {
        if (!/^utf-?8$/i.test(label)) throw new RangeError('Unknown encoding')
        super(label)
      }
    } as typeof TextDecoder
    try {
      const bytes = Uint8Array.from('<meta name="description" content="caf\u00e9">', (char) => char.charCodeAt(0))
      setPageFetch(async () => new Response(bytes, { headers: { 'content-type': 'text/html; charset=ISO-8859-1' } }))
      expect((await getPreviewMeta('https://latin1.example')).description).toBe('caf\u00e9')
    } finally {
      globalThis.TextDecoder = NativeDecoder
    }
  })
  it('frees the worker when a load waiting on rendered metadata is cancelled', async () => {
    const signals: AbortSignal[] = []
    setPreviewRenderedMeta(
      (_url, signal) =>
        new Promise((resolve) => {
          signals.push(signal)
          signal.addEventListener('abort', () => resolve(null), { once: true })
        }),
    )
    try {
      setPageFetch(async (url) =>
        url.includes('stuck') ? new Response('denied', { status: 403 }) : new Response('<meta name="description" content="Fine">'),
      )
      const controllers = [new AbortController(), new AbortController()]
      const stuck = controllers.map((controller, index) =>
        loadBookmarkPreview(`https://stuck${index}.example`, 'page-image', false, { signal: controller.signal }).catch(
          (error) => error.name,
        ),
      )
      while (signals.length < 2) await new Promise((resolve) => setTimeout(resolve, 1))
      controllers.forEach((controller) => controller.abort())
      expect(await Promise.all(stuck)).toEqual(['AbortError', 'AbortError'])
      expect(signals.every((signal) => signal.aborted)).toBe(true)
      expect((await loadBookmarkPreview('https://healthy.example', 'page-image')).description).toBe('Fine')
    } finally {
      setPreviewRenderedMeta(undefined)
    }
  })
  it('falls back to Twitter images and rejects non-http images', async () => {
    setPageFetch(
      async () =>
        new Response(
          '<meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="/twitter.png"><meta name="description" content="Summary">',
        ),
    )
    expect(await getPreviewMeta('https://twitter.example')).toEqual({
      description: 'Summary',
      imageUrl: 'https://twitter.example/twitter.png',
    })
  })
  it('deduplicates first downloads and reuses persisted image bytes without network access', async () => {
    let pages = 0,
      images = 0
    setPageFetch(async () => {
      pages++
      return new Response(html)
    })
    setPreviewImageFetch(async () => {
      images++
      return 'data:image/jpeg;base64,Y292ZXI='
    })
    const url = 'https://cache.example/article'
    const first = loadBookmarkPreview(url, 'page-image')
    expect(loadBookmarkPreview(url, 'page-image')).toBe(first)
    const preview = await first
    expect(preview.imageUri).toBe('data:image/jpeg;base64,Y292ZXI=')
    expect(preview.imageUrl).toBe('https://cache.example/cover.jpg')
    setPageFetch(async () => {
      throw new Error('offline')
    })
    expect(await loadBookmarkPreview(url, 'page-image')).toEqual(preview)
    expect(pages).toBe(1)
    expect(images).toBe(1)
    expect(await readPreview(previewKey(url, 'page-image'))).toEqual(preview)
  })
  it('captures only on explicit refresh and stores screenshots separately from page images', async () => {
    let captures = 0
    setPageFetch(async () => new Response(html))
    setPreviewCapture(async () => {
      captures++
      return 'data:image/png;base64,c2NyZWVu'
    })
    const url = 'https://capture.example/'
    expect((await loadBookmarkPreview(url, 'screenshot')).imageUri).toBe('')
    expect(captures).toBe(0)
    const preview = await loadBookmarkPreview(url, 'screenshot', true)
    expect(preview.imageUri).toBe('data:image/png;base64,c2NyZWVu')
    expect(captures).toBe(1)
    expect(await readPreview(previewKey(url, 'page-image'))).toBeUndefined()
    expect((await loadBookmarkPreview(url, 'screenshot')).imageUri).toBe(preview.imageUri)
    expect(captures).toBe(1)
  })
  it('keeps the previous cached preview when refresh fails', async () => {
    const url = 'https://refresh.example/'
    setPageFetch(async () => new Response(html))
    setPreviewImageFetch(async () => 'data:image/jpeg;base64,b2xk')
    const old = await loadBookmarkPreview(url, 'page-image')
    setPreviewImageFetch(async () => {
      throw new Error('download failed')
    })
    await expect(loadBookmarkPreview(url, 'page-image', true)).rejects.toThrow('download failed')
    expect(await loadBookmarkPreview(url, 'page-image')).toEqual(old)
  })
  it('allows a screenshot refresh even when the metadata page cannot be fetched', async () => {
    setPageFetch(async () => {
      throw new Error('blocked')
    })
    setPreviewCapture(async () => 'data:image/png;base64,c2NyZWVu')
    expect((await loadBookmarkPreview('https://blocked.example/', 'screenshot', true)).imageUri).toBe(
      'data:image/png;base64,c2NyZWVu',
    )
  })
  it('normalizes per-bookmark source overrides', () => {
    expect(previewSource('default', 'screenshot')).toBe('screenshot')
    expect(previewSource('page-image', 'screenshot')).toBe('page-image')
    expect(previewSource('invalid')).toBe('page-image')
  })
  it('serves cached previews immediately while another URL is downloading', async () => {
    const cachedURL = 'https://fast-cache.example/'
    await writePreview(previewKey(cachedURL, 'page-image'), {
      description: 'Cached',
      imageUrl: '',
      imageUri: '',
      savedAt: Date.now(),
    })
    let release: () => void = () => {}
    let started: () => void = () => {}
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    setPageFetch(async () => {
      started()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return new Response('<meta name="description" content="Downloaded">')
    })
    const downloading = loadBookmarkPreview('https://slow-download.example/', 'page-image')
    await startedPromise
    try {
      const cached = await Promise.race([
        loadBookmarkPreview(cachedURL, 'page-image'),
        new Promise<undefined>((resolve) => setTimeout(resolve, 500)),
      ])
      expect(cached?.description).toBe('Cached')
    } finally {
      release()
      await downloading
    }
  })
  it('caches descriptions when a first image download fails', async () => {
    setPageFetch(async () => new Response(html))
    setPreviewImageFetch(async () => {
      throw new Error('bad image')
    })
    const result = await loadBookmarkPreview('https://bad-image.example/', 'page-image')
    expect(result.description).toBe('Saved article')
    expect(result.imageUri).toBe('')
  })
  it('rejects non-web URLs without initiating page fetches', async () => {
    let calls = 0
    setPageFetch(async () => {
      calls++
      return new Response(html)
    })
    await expect(loadBookmarkPreview('file:///private/data', 'page-image')).rejects.toThrow()
    expect(calls).toBe(0)
  })
  it('retains large collections and manual screenshots while new page images are cached', async () => {
    const screenshotKey = previewKey('https://retained.example/', 'screenshot')
    const value = { description: 'Saved', imageUrl: '', imageUri: 'data:image/png;base64,c2NyZWVu', savedAt: 1 }
    await writePreview(screenshotKey, value)
    for (let i = 0; i < 150; i++) await writePreview(`retention:${i}`, { ...value, savedAt: i + 2 })
    expect(await readPreview('retention:0')).toBeDefined()
    expect(await readPreview(screenshotKey)).toEqual(value)
  })
  it('caches failed metadata loads and lets manual refresh bypass the retry delay', async () => {
    let calls = 0
    setPageFetch(async () => {
      calls++
      throw new Error('blocked')
    })
    const url = 'https://negative-cache.example/'
    const failed = await loadBookmarkPreview(url, 'page-image')
    expect(failed.retryAfter).toBeGreaterThan(Date.now())
    expect(failed.retryAfter! - failed.savedAt).toBeLessThanOrEqual(10000)
    expect(await loadBookmarkPreview(url, 'page-image')).toEqual(failed)
    expect(calls).toBe(1)
    setPageFetch(async () => {
      calls++
      return new Response('<meta name="description" content="Recovered">')
    })
    expect((await loadBookmarkPreview(url, 'page-image', true)).description).toBe('Recovered')
    expect(calls).toBe(2)
  })
  it('retries when an in-flight automatic load is failing', async () => {
    let started!: () => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    setPageFetch(async (_url, init) => {
      started()
      await new Promise<void>((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('failed')), { once: true }),
      )
      throw new Error('failed')
    })
    const url = 'https://refresh-during-failure.example/'
    const initial = loadBookmarkPreview(url, 'page-image')
    const initialResult = initial.catch(() => {})
    await began
    setPageFetch(async () => new Response('<meta name="description" content="Refreshed">'))
    const refreshed = await loadBookmarkPreview(url, 'page-image', true)
    await initialResult
    expect(refreshed.description).toBe('Refreshed')
  })
  it('cancels unmounted queued tiles and prioritizes a manual refresh', async () => {
    const started = new Set<string>()
    const release: (() => void)[] = []
    let running = 0
    setPageFetch(async (url) => {
      started.add(url)
      if (url.includes('occupied')) {
        running++
        await new Promise<void>((resolve) => release.push(resolve))
        running--
      }
      return new Response('<meta name="description" content="Loaded">')
    })
    const first = loadBookmarkPreview('https://occupied.example/1', 'page-image')
    const second = loadBookmarkPreview('https://occupied.example/2', 'page-image')
    while (running !== 2) await new Promise((resolve) => setTimeout(resolve, 1))
    const controller = new AbortController()
    const queued = loadBookmarkPreview('https://cancelled.example/', 'page-image', false, { signal: controller.signal })
    const cancelled = queued.catch((error: Error) => error)
    controller.abort()
    expect(((await cancelled) as Error).message).toBe('preview_cancelled')
    try {
      const manual = await Promise.race([
        loadBookmarkPreview('https://manual-priority.example/', 'page-image', true),
        new Promise<undefined>((resolve) => setTimeout(resolve, 500)),
      ])
      expect(manual?.description).toBe('Loaded')
    } finally {
      release.forEach((done) => done())
      await Promise.all([first, second])
    }
    expect(started.has('https://cancelled.example/')).toBe(false)
  })
  it('uses a longer retry only for persistent responses', async () => {
    for (const [status, duration] of [
      [404, 3600000],
      [503, 10000],
      [429, 10000],
    ]) {
      setPageFetch(async () => new Response('unavailable', { status }))
      const result = await loadBookmarkPreview(`https://retry-status.example/${status}`, 'page-image')
      expect(result.retryAfter! - result.savedAt).toBeGreaterThan(duration! - 1000)
      expect(result.retryAfter! - result.savedAt).toBeLessThanOrEqual(duration!)
    }
  })
  it('lets a mounted tile recover after its automatic request is superseded by a failed refresh', async () => {
    const url = 'https://failed-refresh-recovery.example/'
    let started!: () => void
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    setPageFetch(async (_url, init) => {
      started()
      await new Promise<void>((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(new Error('cancelled'))),
      )
      return new Response(html)
    })
    const initial = loadBookmarkPreview(url, 'page-image').catch(() => {})
    await began
    let recovered!: () => void
    const recovery = new Promise<void>((resolve) => {
      recovered = resolve
    })
    const unsubscribe = onPreviewChange((key) => {
      if (key !== previewKey(url, 'page-image')) return
      unsubscribe()
      setPageFetch(async () => new Response('<meta name="description" content="Recovered tile">'))
      void loadBookmarkPreview(url, 'page-image').then((value) => {
        expect(value.description).toBe('Recovered tile')
        recovered()
      })
    })
    setPageFetch(async () => {
      throw new Error('refresh failed')
    })
    await expect(loadBookmarkPreview(url, 'page-image', true)).rejects.toThrow('refresh failed')
    await initial
    await recovery
  })
  it('prunes unused web entries and prevents late writes for deleted bookmarks', async () => {
    const url = 'https://still-live.example/'
    const screenshot = previewKey(url, 'screenshot')
    const image = previewKey(url, 'page-image')
    const deleted = previewKey('https://removed.example/', 'screenshot')
    const value = { description: 'Saved', imageUrl: '', imageUri: 'data:image/png;base64,c2NyZWVu', savedAt: 1 }
    for (const key of [screenshot, image, deleted]) await writePreview(key, value)
    await updatePreviewBookmarks([url])
    expect(await readPreview(screenshot)).toEqual(value)
    expect(await readPreview(image)).toEqual(value)
    expect(await readPreview(deleted)).toBeUndefined()
    await writePreview(deleted, value)
    expect(await readPreview(deleted)).toBeUndefined()
    const closeEditor = retainEditorPreview('https://unsaved-editor.example/')
    await updatePreviewBookmarks([url])
    const temporary = previewKey('https://unsaved-editor.example/', 'screenshot')
    await writePreview(temporary, value)
    expect(await readPreview(temporary)).toEqual(value)
    closeEditor()
    await updatePreviewBookmarks([url])
    expect(await readPreview(temporary)).toBeUndefined()
  })
})
