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

export const getRuntimeFaviconCandidates = (pageUrl?: string, iconUrl?: string) => {
  const candidates = [iconUrl]

  if (pageUrl) {
    candidates.push(getDirectFavicon(pageUrl))
    candidates.push(getDuckDuckGoIcon(pageUrl))
    candidates.push(getGoogleFavicon(pageUrl))
  }

  return [...new Set(candidates.filter((item): item is string => !!item))]
}
