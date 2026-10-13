import { fetchWithTimeout } from './fetch-with-timeout'
import { PreviewResponseError, persistentPreviewStatus } from './bookmark-preview-types'
import * as cheerio from 'cheerio/slim'
import { getDirectFavicon, getGoogleFavicon } from './favicon'
import { getFallbackTitle, getRedditPostId, hasPlaceholderTitle } from './bookmark-title'

export { getDirectFavicon, getDuckDuckGoIcon, getGoogleFavicon, getRuntimeFaviconCandidates } from './favicon'

export { getFallbackTitle } from './bookmark-title'

export const getFallbackIcon = (url: string) => getGoogleFavicon(url)

// The desktop app's webview is a normal web origin, so a plain `fetch` of some
// other site is blocked by CORS and every bookmark falls back to its hostname.
// It swaps in a fetch that goes through Go instead; Android and the extension
// (which holds host permissions) keep the global one.
type PageFetch = (
  url: string,
  init: { method: 'GET' | 'HEAD'; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>

let pageFetch: PageFetch = (url, init) => fetchWithTimeout(url, { ...init, redirect: 'follow' })

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

// Bot protection can answer a page request with a JavaScript challenge that is
// not an error status: AWS WAF (e.g. fernsehserien.de) sends 202. Parsing it as
// the page would save a bookmark with no title, description or image.
const isChallenge = (res: Response) =>
  res.status === 202 || res.headers.get('x-amzn-waf-action') === 'challenge'

const bytesToChars = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return text
}

// On native, fetchWithTimeout's buffered Response is whatwg-fetch's, whose
// text() maps each byte to one char and garbles every non-ASCII UTF-8 page.
// Decode the bytes here instead, with the charset the page declares. Hermes'
// TextDecoder only knows UTF-8; for any other declared charset keep the
// byte-per-char mapping, which is exact for ISO-8859-1 and leaves the ASCII
// markup of other encodings intact.
const readHtml = async (res: Response) => {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const declared = /charset\s*=\s*["']?([\w-]+)/i
  const charset =
    declared.exec(res.headers.get('content-type') ?? '')?.[1] ||
    declared.exec(bytesToChars(bytes.subarray(0, 1024)))?.[1]
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes)
  } catch {
    return bytesToChars(bytes)
  }
}

// A fetched page's social tags are usually the cleaner title. Once scripts have
// run it is the other way round: the document title is what they updated, and
// the social tags are often the static shell's (a site name, say).
const extractTitle = ($: cheerio.CheerioAPI, url: string, rendered = false) => {
  const postId = getRedditPostId(url)
  const post = postId ? $(`shreddit-post[id="t3_${postId}"]`) : null
  const candidates = [
    post?.attr('post-title'),
    post?.find('[slot="title"]').first().text(),
    postId ? $(`.thing[data-fullname="t3_${postId}"] a.title`).first().text() : '',
    // The document's own title only: an inline SVG's <title> names an icon.
    ...(rendered ? [$('head > title').first().text()] : []),
    $('meta[property="og:title"]').attr('content'),
    $('meta[name="twitter:title"]').attr('content'),
    $('title').text(),
    $('meta[property="og:site_name"]').attr('content'),
  ]

  return candidates.find((candidate) => candidate && !hasPlaceholderTitle(candidate, url))?.trim()
}

/**
 * The title and icon a page's HTML declares, each empty when it declares none.
 * `url` is the address the HTML came from, after any redirect.
 */
export function parsePageMeta(html: string, url: string, { iconBase = url, rendered = false } = {}) {
  const $ = cheerio.load(html)
  const icon = $('link[rel*=icon]').attr('href')
  return { title: extractTitle($, url, rendered) || '', icon: icon ? new URL(icon, iconBase).href : '' }
}

export async function getMeta(url: string) {
  try {
    const res = await pageFetch(url, { method: 'GET', headers: BROWSER_HEADERS })

    // Bail out early when the response is unusable so we keep a clean hostname
    // fallback instead of parsing an error page or binary payload as HTML.
    const contentType = res.headers.get('content-type') ?? ''
    const isNonDocument = /^(image|video|audio|font)\/|application\/(pdf|zip|octet-stream|json)/i.test(contentType)
    if (!res.ok || isNonDocument || isChallenge(res)) {
      return {
        title: getFallbackTitle(url),
        icon: getGoogleFavicon(url),
      }
    }

    const html = await readHtml(res)
    // Share links (redd.it and /s/...) can redirect to the post permalink.
    const meta = parsePageMeta(html, res.url || url, { iconBase: url })
    const title = meta.title || getFallbackTitle(url)
    const directFavicon = getDirectFavicon(url)

    let resolvedIcon = meta.icon

    if (!resolvedIcon && (await canLoadImageUrl(directFavicon))) {
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

// `data-a-dynamic-image` maps each rendition's url to its [width, height].
const amazonProductImage = (hires?: string, renditions?: string) => {
  if (hires) return hires
  try {
    const sizes = Object.entries(JSON.parse(renditions || '{}') as Record<string, number[]>)
    return sizes.sort((a, b) => (b[1]?.[0] || 0) - (a[1]?.[0] || 0))[0]?.[0] || ''
  } catch {
    return ''
  }
}

/** Preview metadata is cached separately from editable bookmark titles. */
export async function getPreviewMeta(url: string, signal?: AbortSignal) {
  const res = await pageFetch(url, { method: 'GET', headers: BROWSER_HEADERS, signal })
  // Reported as blocked, so native retries through the rendered page.
  if (isChallenge(res)) throw new PreviewResponseError('preview_page_failed', true, 403)
  if (!res.ok || !/text\/html|application\/xhtml\+xml/i.test(res.headers.get('content-type') || 'text/html')) {
    throw new PreviewResponseError(
      'preview_page_failed',
      res.ok || persistentPreviewStatus(res.status),
      res.ok ? undefined : res.status,
    )
  }
  const $ = cheerio.load(await readHtml(res))
  const description = (
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') ||
    ''
  )
    .trim()
    .slice(0, 2000)
  let imageUrl = ''
  for (const value of [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[property="twitter:image"]').attr('content'),
    // Shops often skip the social tags: Amazon only marks up its product
    // image, mydealz only preloads it.
    $('link[rel="image_src"]').attr('href'),
    amazonProductImage($('#landingImage').attr('data-old-hires'), $('#landingImage').attr('data-a-dynamic-image')),
    $('link[rel="preload"][as="image"]').attr('href'),
  ]) {
    try {
      const resolved = new URL(value || '', res.url || url)
      if (value && /^https?:$/.test(resolved.protocol)) {
        imageUrl = resolved.href
        break
      }
    } catch {}
  }
  return { description, imageUrl }
}
