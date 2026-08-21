export interface SharePayload {
  webUrl?: string
  text?: string
}

const URL_RE = /https?:\/\/[^\s]+/gi

export function parseSharedUrl(payload?: SharePayload | null) {
  return parseSharedUrls(payload)[0] || null
}

/**
 * Collects every http(s) link a share carries. Browsers sharing several tabs at once
 * often send them as one newline separated text payload, so a payload can hold many.
 */
export function parseSharedUrls(payload?: SharePayload | null) {
  const urls = new Set<string>()

  for (const candidate of [payload?.webUrl, payload?.text]) {
    const value = candidate?.trim()
    if (!value) {
      continue
    }

    // Only treat the whole payload as a URL when it can't hold several: the URL parser
    // strips whitespace, so a newline separated list would collapse into one link.
    if (!/\s/.test(value) && isValidUrl(value)) {
      urls.add(value)
      continue
    }

    for (const match of value.match(URL_RE) || []) {
      const url = match.replace(/[.,)\]]+$/, '')
      if (isValidUrl(url)) {
        urls.add(url)
      }
    }
  }

  return [...urls]
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function htmlLooksLikeBookmarkExport(content: string) {
  return /<!doctype\s+netscape-bookmark/i.test(content) || /<h1\b[^>]*>\s*bookmarks?\s*<\/h1>/i.test(content)
}
