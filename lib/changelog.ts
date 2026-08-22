export type ReleaseEntry = {
  tag: string
  url: string
  updatedAt: string
  items: string[]
}

const RELEASES_FEED_URL = 'https://github.com/nonbili/Nori/releases.atom'

const entryPattern = /<entry>([\s\S]*?)<\/entry>/g

const decodeEntities = (input: string) =>
  input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const stripTags = (input: string) => input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const extractTag = (input: string, tag: string) => {
  const match = input.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`))
  return match?.[1]?.trim() || ''
}

const extractLinkHref = (input: string) => input.match(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/)?.[1] || ''

const extractListItems = (content: string) =>
  [...decodeEntities(content).matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((match) => stripTags(decodeEntities(match[1] || '')))
    .filter(Boolean)

export const parseReleaseFeed = (xml: string): ReleaseEntry[] =>
  [...xml.matchAll(entryPattern)]
    .map((match) => {
      const entry = match[1] || ''
      const tag = extractTag(entry, 'title')
      const updatedAt = extractTag(entry, 'updated')
      const url = extractLinkHref(entry)

      if (!tag || !updatedAt || !url) {
        return null
      }

      return {
        tag,
        url,
        updatedAt,
        items: extractListItems(extractTag(entry, 'content')),
      } satisfies ReleaseEntry
    })
    .filter((entry): entry is ReleaseEntry => Boolean(entry))

export const fetchReleaseEntries = async (): Promise<ReleaseEntry[]> => {
  const res = await fetch(RELEASES_FEED_URL, {
    headers: { accept: 'application/atom+xml, text/xml;q=0.9, */*;q=0.8' },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch changelog: ${res.status}`)
  }

  return parseReleaseFeed(await res.text())
}
