import { describe, expect, it } from 'bun:test'
import { createBookmarkMetaCache } from './bookmark-meta-cache-utils'

describe('bookmark meta cache utils', () => {
  it('reuses in-flight requests for the same url', async () => {
    let calls = 0
    const cache = createBookmarkMetaCache(async (url: string) => {
      calls += 1
      return { title: url, icon: '' }
    })

    const first = cache.prefetch('https://example.com')
    const second = cache.get('https://example.com')

    expect(second).toBe(first)
    await expect(first).resolves.toEqual({ title: 'https://example.com', icon: '' })
    expect(calls).toBe(1)
  })

  it('evicts the oldest request when the cache exceeds max entries', async () => {
    const cache = createBookmarkMetaCache(async (url: string) => ({ title: url }), 2)

    const first = cache.prefetch('https://one.example')
    cache.prefetch('https://two.example')
    cache.prefetch('https://three.example')

    expect(cache.size()).toBe(2)
    expect(cache.get('https://one.example')).not.toBe(first)
  })
})
