export const getFallbackTitle = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const REDDIT_PLACEHOLDER_TITLES = ['Reddit', 'Reddit - Dive into anything', 'Blocked', 'Blocked by network security']

export function isRedditUrl(url: string) {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'redd.it' || hostname === 'reddit.com' || hostname.endsWith('.reddit.com')
  } catch {
    return false
  }
}

export function getRedditPostId(url: string) {
  if (!isRedditUrl(url)) {
    return null
  }
  const parsed = new URL(url)
  const match = parsed.hostname === 'redd.it'
    ? parsed.pathname.match(/^\/([a-z0-9]+)\/?$/i)
    : parsed.pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)
  return match?.[1].toLowerCase() || null
}

export function hasPlaceholderTitle(title: string, url: string) {
  const trimmed = title.trim()
  return !trimmed || trimmed === getFallbackTitle(url) || (
    isRedditUrl(url) && REDDIT_PLACEHOLDER_TITLES.some((value) => value.toLowerCase() === trimmed.toLowerCase())
  )
}
