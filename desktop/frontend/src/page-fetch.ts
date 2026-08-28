/**
 * Bookmark metadata (the real page title and favicon) is fetched by the shared
 * `lib/bookmark.ts`. In the extension that fetch is covered by host
 * permissions; here the webview is an ordinary web origin, so every
 * cross-origin request is blocked by CORS and bookmarks fell back to their
 * hostname. Route it through Go instead.
 */
import { Call } from '@wailsio/runtime'
import { setPageFetch } from 'nori/lib/bookmark'

const PAGE = 'main.PageService'

type PageResponse = { status: number; contentType: string; body: string }

export function installDesktopPageFetch() {
  setPageFetch(async (url, init) => {
    const res: PageResponse = await Call.ByName(`${PAGE}.Fetch`, url, init.method, init.headers ?? {})
    return new Response(init.method === 'HEAD' ? null : res.body, {
      status: res.status,
      headers: res.contentType ? { 'content-type': res.contentType } : {},
    })
  })
}
