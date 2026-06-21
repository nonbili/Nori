export function createBookmarkMetaCache<T>(loadMeta: (url: string) => Promise<T>, maxEntries = 50) {
  const cache = new Map<string, Promise<T>>()

  return {
    prefetch(url: string) {
      const cached = cache.get(url)
      if (cached) {
        return cached
      }

      const request = loadMeta(url)
      cache.set(url, request)

      if (cache.size > maxEntries) {
        const oldestKey = cache.keys().next().value
        if (oldestKey) {
          cache.delete(oldestKey)
        }
      }

      return request
    },
    get(url: string) {
      return cache.get(url) || this.prefetch(url)
    },
    size() {
      return cache.size
    },
  }
}
