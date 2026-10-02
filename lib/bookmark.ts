import * as cheerio from 'cheerio/slim'
import { getDirectFavicon, getGoogleFavicon } from './favicon'
import { getFallbackTitle, getRedditPostId, hasPlaceholderTitle } from './bookmark-title'

export { getDirectFavicon, getDuckDuckGoIcon, getGoogleFavicon, getRuntimeFaviconCandidates } from './favicon'

export { getFallbackTitle } from './bookmark-title'

export const getFallbackIcon = (url: string) =>
  getGoogleFavicon(url)

// The desktop app's webview is a normal web origin, so a plain `fetch` of some
// other site is blocked by CORS and every bookmark falls back to its hostname.
// It swaps in a fetch that goes through Go instead; Android and the extension
// (which holds host permissions) keep the global one.
type PageFetch = (url: string, init: { method: 'GET' | 'HEAD'; headers?: Record<string, string> }) => Promise<Response>

let pageFetch: PageFetch = (url, init) => fetch(url, { ...init, redirect: 'follow' })

export const setPageFetch = (fetcher: PageFetch) => {
  pageFetch = fetcher
}

const canLoadImageUrl = async (url: string) => {
  if (!url) {
    return false
  }

  try {
    const head = await pageFetch(url, { method: 'HEAD' })
    if (head.ok) {
      return true
    }
  } catch {}

  try {
    const get = await pageFetch(url, { method: 'GET' })
    return get.ok
  } catch {
    return false
  }
}

// Some sites (e.g. fifa.com) serve an empty/blocked page to requests without a
// browser-like User-Agent, which left bookmarks showing only the URL. Pretend to
// be a regular browser so we get the real HTML with a usable <title>/og:title.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const extractTitle = ($: cheerio.CheerioAPI, url: string) => {
  const postId = getRedditPostId(url)
  const post = postId ? $(`shreddit-post[id="t3_${postId}"]`) : null
  const candidates = [
    post?.attr('post-title'),
    post?.find('[slot="title"]').first().text(),
    postId ? $(`.thing[data-fullname="t3_${postId}"] a.title`).first().text() : '',
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('title').text(),
    $('meta[property="og:site_name"]').attr('content'),
  ]

  return candidates.find((candidate) => candidate && !hasPlaceholderTitle(candidate, url))?.trim()
}

export async function getMeta(url: string) {
  try {
    const res = await pageFetch(url, { method: 'GET', headers: BROWSER_HEADERS })

    // Bail out early when the response is unusable so we keep a clean hostname
    // fallback instead of parsing an error page or binary payload as HTML.
    const contentType = res.headers.get('content-type') ?? ''
    const isNonDocument = /^(image|video|audio|font)\/|application\/(pdf|zip|octet-stream|json)/i.test(contentType)
    if (!res.ok || isNonDocument) {
      return {
        title: getFallbackTitle(url),
        icon: getGoogleFavicon(url),
      }
    }

    const html = await res.text()
    const $ = cheerio.load(html)
    // Share links (redd.it and /s/...) can redirect to the post permalink.
    const title = extractTitle($, res.url || url) || getFallbackTitle(url)
    const icon = $('link[rel*=icon]').attr('href')
    const directFavicon = getDirectFavicon(url)

    let resolvedIcon = icon ? new URL(icon, url).href : ''

    if (!resolvedIcon && await canLoadImageUrl(directFavicon)) {
      resolvedIcon = directFavicon
    }

    return {
      title,
      icon: resolvedIcon || getGoogleFavicon(url),
    }
  } catch {
    return {
      title: getFallbackTitle(url),
      icon: getGoogleFavicon(url),
    }
  }
}
