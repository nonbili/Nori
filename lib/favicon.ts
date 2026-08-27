export const getGoogleFavicon = (url: string) =>
  `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=128`

export const getDuckDuckGoIcon = (url: string) => {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`
  } catch {
    return getGoogleFavicon(url)
  }
}

export const getDirectFavicon = (url: string) => {
  try {
    return new URL('/favicon.ico', url).href
  } catch {
    return ''
  }
}

// DuckDuckGo answers unknown hosts with a 404 that still carries a placeholder
// PNG body, so <img> reports a successful load and the fallback chain stalls on
// a generic grey icon. Skip those urls at render time instead.
const isDuckDuckGoIcon = (url: string) => {
  try {
    return new URL(url).hostname === 'icons.duckduckgo.com'
  } catch {
    return false
  }
}

export const getRuntimeFaviconCandidates = (pageUrl?: string, iconUrl?: string) => {
  const candidates = [iconUrl && !isDuckDuckGoIcon(iconUrl) ? iconUrl : '']

  if (pageUrl) {
    candidates.push(getDirectFavicon(pageUrl))
    candidates.push(getGoogleFavicon(pageUrl))
  }

  return [...new Set(candidates.filter((item): item is string => !!item))]
}
