import { getMeta } from '@/lib/bookmark'
import { createBookmarkMetaCache } from '@/lib/bookmark-meta-cache-utils'

type BookmarkMeta = Awaited<ReturnType<typeof getMeta>>

const metadataCache = createBookmarkMetaCache<BookmarkMeta>(getMeta)

export function prefetchBookmarkMeta(url: string) {
  return metadataCache.prefetch(url)
}

export function getPrefetchedBookmarkMeta(url: string) {
  return metadataCache.get(url)
}
