import { parseSocialDocuments, pageDocuments } from './social-post-providers'
import type { SocialPost, SocialTarget } from './social-post'

/** Sites whose posts can be read from their own page in a WebView, where a plain fetch is refused. */
export const PAGE_CAPTURE_SITES = new Set(['facebook', 'instagram', 'threads', 'tiktok'])

export const canCaptureFromPage = (target?: SocialTarget) => Boolean(target && PAGE_CAPTURE_SITES.has(target.site))

const MAX_BODY = 8 * 1024 * 1024
// The page parser's own limit: a larger page is not worth sending over the bridge.
const MAX_PAGE = 20 * 1024 * 1024

/**
 * Installed before any page script: forwards the bodies of the page's own API responses, which is
 * where signed-in sites load a post once the page shell is up. Nothing is changed or blocked, and
 * only the page's GraphQL/API calls are read, never images or media.
 */
export const CAPTURE_SCRIPT = `(() => {
  // Android runs document start scripts in every frame: a sign-in or captcha frame of another
  // site must not have its responses read.
  if (window !== window.top || window.__noriCapture) return
  window.__noriCapture = true
  const MAX = ${MAX_BODY}
  const wanted = (url) => {
    try { return /graphql|\\/api\\//i.test(new URL(url, location.href).pathname) } catch (e) { return false }
  }
  const send = (url, body) => {
    if (typeof body !== 'string' || !body || body.length > MAX) return
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nori-capture-response', url: String(url), body })) } catch (e) {}
  }
  const fetch0 = window.fetch
  if (fetch0) window.fetch = function () {
    const result = fetch0.apply(this, arguments)
    result.then((response) => {
      if (wanted(response.url)) response.clone().text().then((body) => send(response.url, body), () => {})
    }, () => {})
    return result
  }
  const send0 = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try {
        if (!wanted(this.responseURL)) return
        if (this.responseType === '' || this.responseType === 'text') send(this.responseURL, this.responseText)
        else if (this.responseType === 'json') send(this.responseURL, JSON.stringify(this.response))
      } catch (e) {}
    })
    return send0.apply(this, arguments)
  }
})()`

/** Posts the rendered page, whose scripts hold the data it was served with. */
export const READ_PAGE_SCRIPT = `(() => {
  try {
    const html = document.documentElement.outerHTML
    if (html.length <= ${MAX_PAGE}) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'nori-capture-page', html }))
  } catch (e) {}
})(); true;`

export type CaptureMessage = { type: 'nori-capture-response'; url: string; body: string } | { type: 'nori-capture-page'; html: string }

export function parseCaptureMessage(data: string): CaptureMessage | undefined {
  try {
    const value = JSON.parse(data)
    if (value?.type === 'nori-capture-response' && typeof value.body === 'string' && typeof value.url === 'string') return value
    if (value?.type === 'nori-capture-page' && typeof value.html === 'string') return value
  } catch {}
}

/**
 * The JSON in an API response body. Facebook prefixes some with `for (;;);` and streams GraphQL as
 * one JSON document per line.
 */
export function responseDocuments(body: string): any[] {
  if (typeof body !== 'string' || body.length > MAX_BODY) return []
  const text = body.replace(/^\s*for\s*\(;;\);/, '')
  try { return [JSON.parse(text)] } catch {}
  const documents: any[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue
    try { documents.push(JSON.parse(trimmed)) } catch {}
  }
  return documents
}

/** The JSON in a message, parsed once on arrival so a later search does not parse it again. */
export function messageDocuments(message: CaptureMessage): any[] {
  return message.type === 'nori-capture-page' ? pageDocuments(message.html) : responseDocuments(message.body)
}

/** The target post among the documents the page has shown so far, or undefined while it is not there yet. */
export function capturedSocialPost(target: SocialTarget, documents: any[]): SocialPost | undefined {
  if (!documents.length) return
  try {
    return parseSocialDocuments(documents, target)
  } catch {}
}
