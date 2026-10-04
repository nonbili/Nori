/**
 * Bookmark metadata (the real page title and favicon) is fetched by the shared
 * `lib/bookmark.ts`. In the extension that fetch is covered by host
 * permissions; here the webview is an ordinary web origin, so every
 * cross-origin request is blocked by CORS and bookmarks fell back to their
 * hostname. Route it through Go instead.
 */
import { Call } from '@wailsio/runtime'
import { setPreviewCapture, setPreviewImageFetch } from 'nori/lib/bookmark-preview'
import { setPageFetch } from 'nori/lib/bookmark'
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
}
