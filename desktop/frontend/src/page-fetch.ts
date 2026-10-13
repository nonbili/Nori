/**
 * Bookmark metadata (the real page title and favicon) is fetched by the shared
 * `lib/bookmark.ts`. In the extension that fetch is covered by host
 * permissions; here the webview is an ordinary web origin, so every
 * cross-origin request is blocked by CORS and bookmarks fell back to their
 * hostname. Route it through Go instead.
 */
import { Call } from '@wailsio/runtime'
import { setPreviewCapture, setPreviewImageFetch } from 'nori/lib/bookmark-preview'
import { parsePageMeta, setPageFetch } from 'nori/lib/bookmark'
import { setRenderedTitlesSupported } from 'nori/lib/rendered-titles'
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
}
