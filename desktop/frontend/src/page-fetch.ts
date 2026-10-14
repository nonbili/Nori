/**
 * Bookmark metadata (the real page title and favicon) is fetched by the shared
 * `lib/bookmark.ts`. In the extension that fetch is covered by host
 * permissions; here the webview is an ordinary web origin, so every
 * cross-origin request is blocked by CORS and bookmarks fell back to their
 * hostname. Route it through Go instead.
 */
import { Call } from '@wailsio/runtime'
import { setPreviewCapture, setPreviewImageFetch, setPreviewRenderedMeta } from 'nori/lib/bookmark-preview'
import { parsePageMeta, parsePreviewMeta, setPageFetch } from 'nori/lib/bookmark'
import { setPreviewPageDriver } from 'nori/lib/preview-page'
import { setRenderedTitlesSupported } from 'nori/lib/rendered-titles'
import { applyRenderedTitle } from 'nori/lib/title-backfill'
import { completeActiveJob, setWebViewTitleResolverAvailable, webViewResolver$ } from 'nori/lib/webview-title-resolver'
import { PreviewResponseError } from 'nori/lib/bookmark-preview-types'

const PAGE = 'main.PageService'

type PageResponse = { url: string; status: number; contentType: string; body: string }

export function installDesktopPageFetch() {
  setPreviewImageFetch(async (url) => {
    const result: { dataUrl: string; error?: string; persistent: boolean } = await Call.ByName(`${PAGE}.Image`, url)
    if (result.error) throw new PreviewResponseError(result.error, result.persistent)
    return result.dataUrl
  })
  setPreviewCapture((url) => Call.ByName(`${PAGE}.Screenshot`, url))
  // A site whose bot protection turns the fetch above away (fernsehserien.de
  // answers it with a challenge only a browser can pass) still has a cover image
  // and a title: they are read from the page as the headless browser loads it.
  setPreviewRenderedMeta(async (url, signal) => {
    // A preview scrolled out of view is cancelled. The call is too, which closes
    // the browser in Go and frees this worker for the previews now in view.
    const call = Call.ByName(`${PAGE}.Rendered`, url)
    const abandon = () => void call.cancel()
    signal.addEventListener('abort', abandon, { once: true })
    let page: { url: string; html: string }
    try {
      page = await call
    } finally {
      signal.removeEventListener('abort', abandon)
    }
    if (signal.aborted) return null
    const base = page.url || url
    applyRenderedTitle(url, parsePageMeta(page.html, base, { rendered: true }).title)
    const meta = parsePreviewMeta(page.html, base)
    return meta.imageUrl || meta.description ? meta : null
  })
  setPageFetch(async (url, init) => {
    const res: PageResponse = await Call.ByName(`${PAGE}.Fetch`, url, init.method, init.headers ?? {})
    const response = new Response(init.method === 'HEAD' ? null : res.body, {
      status: res.status,
      headers: res.contentType ? { 'content-type': res.contentType } : {},
    })
    Object.defineProperty(response, 'url', { value: res.url })
    return response
  })

  // "Load pages to get titles": the app answers these jobs with a hidden
  // WebView; here Go renders the page in a headless browser and the shared
  // parser reads the title out of what it returns. A failure (no browser
  // installed, a page that never settles) leaves the fetched title in place.
  webViewResolver$.active.onChange(({ value: job }) => {
    if (!job) return
    void Call.ByName(`${PAGE}.Rendered`, job.url)
      .then((page: { url: string; html: string }) => {
        const meta = parsePageMeta(page.html, page.url || job.url, { rendered: true })
        completeActiveJob(job.id, meta.title ? meta : null)
      })
      .catch(() => completeActiveJob(job.id, null))
  })
  setWebViewTitleResolverAvailable(true)
  setRenderedTitlesSupported(true)

  // "Capture preview": the app shows the page in a WebView. This window cannot
  // embed one, so Go keeps the page open in a headless browser, its frames are
  // drawn in the sheet and the mouse and keys used there are replayed in it.
  setPreviewPageDriver(async (url, size, onFrame) => {
    const id: string = await Call.ByName(`${PAGE}.LiveOpen`, url, size.width, size.height)
    let closed = false
    void (async () => {
      let seq = 0
      while (!closed) {
        // Answers once the page has changed, so this never spins.
        const frame: { seq: number; image: string; loading: boolean; closed: boolean } | null = await Call.ByName(
          `${PAGE}.LiveFrame`,
          id,
          seq,
        ).catch(() => null)
        if (closed) return
        if (!frame || frame.closed) break
        if (frame.seq === seq) continue
        seq = frame.seq
        onFrame({ image: frame.image || undefined, loading: frame.loading })
      }
      // The browser is gone; nothing more will load.
      onFrame({ loading: false })
    })()
    // One at a time: calls race each other otherwise, and a click must not
    // reach the page as a release followed by a press.
    let inputs: Promise<unknown> = Promise.resolve()
    return {
      input: (event) => {
        inputs = inputs.then(() => Call.ByName(`${PAGE}.LiveInput`, id, event)).catch(() => {})
      },
      resize: (width, height) => void Call.ByName(`${PAGE}.LiveResize`, id, width, height).catch(() => {}),
      reload: () => void Call.ByName(`${PAGE}.LiveReload`, id).catch(() => {}),
      read: async () => {
        const page: { url: string; html: string } = await Call.ByName(`${PAGE}.LiveRead`, id)
        const base = page.url || url
        return { title: parsePageMeta(page.html, base, { rendered: true }).title, ...parsePreviewMeta(page.html, base) }
      },
      capture: () => Call.ByName(`${PAGE}.LiveCapture`, id),
      close: () => {
        closed = true
        void Call.ByName(`${PAGE}.LiveClose`, id).catch(() => {})
      },
    }
  })
}
