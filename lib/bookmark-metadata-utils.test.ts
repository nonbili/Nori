import { describe, expect, it } from 'bun:test'
import { canApplyBookmarkMetadata, needsBookmarkMetadata, resolveBookmarkMetadata } from './bookmark-metadata-utils'

describe('saved bookmark metadata', () => {
  it('prefers the rendered title even when fetched metadata could look valid', async () => {
    let fetches = 0
    const result = await resolveBookmarkMetadata('https://example.com/post', true, async () => {
      fetches++
      return { title: 'Example site', icon: '' }
    }, async () => ({ title: 'Actual post', icon: '/icon.png' }))
    expect(result.title).toBe('Actual post')
    expect(fetches).toBe(0)
  })

  it('falls back to fetching when rendering fails or yields a placeholder', async () => {
    for (const render of [
      async () => null,
      async () => ({ title: 'Reddit', icon: '' }),
      async () => { throw new Error('WebView failed') },
    ]) {
      const result = await resolveBookmarkMetadata('https://www.reddit.com/r/test/comments/abc123/', true,
        async () => ({ title: 'Fetched post', icon: '/icon.png' }), render)
      expect(result.title).toBe('Fetched post')
    }
  })

  it('keeps the default fetch path without rendering', async () => {
    let renders = 0
    const result = await resolveBookmarkMetadata('https://example.com/post', false,
      async () => ({ title: 'Fetched post', icon: '' }), async () => {
        renders++
        return null
      })
    expect(result.title).toBe('Fetched post')
    expect(renders).toBe(0)
  })

  it('preserves user titles and rejects deleted or changed bookmarks', () => {
    const previous = { url: 'https://example.com/post', title: 'example.com' }
    expect(needsBookmarkMetadata('My custom title', previous.url)).toBe(false)
    expect(needsBookmarkMetadata(previous.title, previous.url)).toBe(true)
    expect(canApplyBookmarkMetadata(previous, { ...previous }, false)).toBe(true)
    expect(canApplyBookmarkMetadata(previous, { ...previous, title: 'My title' }, false)).toBe(false)
    expect(canApplyBookmarkMetadata(previous, { ...previous, url: 'https://other.com/' }, false)).toBe(false)
    expect(canApplyBookmarkMetadata(previous, previous, true)).toBe(false)
    expect(canApplyBookmarkMetadata(previous, undefined, false)).toBe(false)
  })
})
