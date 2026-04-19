import * as cheerio from 'cheerio/slim'

const getFallbackTitle = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const getFallbackIcon = (url: string) =>
  getDuckDuckGoIcon(url)

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

const canLoadImageUrl = async (url: string) => {
  if (!url) {
    return false
  }

  try {
    const head = await fetch(url, { method: 'HEAD' })
    if (head.ok) {
      return true
    }
  } catch {}

  try {
    const get = await fetch(url, { method: 'GET' })
    return get.ok
  } catch {
    return false
  }
}

export async function getMeta(url: string) {
  try {
    const res = await fetch(url)
    const html = await res.text()
    const $ = cheerio.load(html)
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || getFallbackTitle(url)
    const icon = $('link[rel*=icon]').attr('href')
    const directFavicon = getDirectFavicon(url)
    const duckDuckGoIcon = getDuckDuckGoIcon(url)

    let resolvedIcon = icon ? new URL(icon, url).href : ''

    if (!resolvedIcon && await canLoadImageUrl(directFavicon)) {
      resolvedIcon = directFavicon
    }

    if (!resolvedIcon && await canLoadImageUrl(duckDuckGoIcon)) {
      resolvedIcon = duckDuckGoIcon
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
