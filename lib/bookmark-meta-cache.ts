import { getMeta } from '@/lib/bookmark'

type BookmarkMeta = Awaited<ReturnType<typeof getMeta>>

const metadataCache = new Map<string, Promise<BookmarkMeta>>()
const MAX_CACHE_ENTRIES = 50

export function prefetchBookmarkMeta(url: string) {
  const cached = metadataCache.get(url)
  if (cached) {
    return cached
  }

  const request = getMeta(url)
  metadataCache.set(url, request)

  if (metadataCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = metadataCache.keys().next().value
    if (oldestKey) {
      metadataCache.delete(oldestKey)
    }
  }

  return request
}

export function getPrefetchedBookmarkMeta(url: string) {
  return metadataCache.get(url) || prefetchBookmarkMeta(url)
}
