import { afterEach, describe, expect, it } from 'bun:test'
import {
  getDirectFavicon,
  getDuckDuckGoIcon,
  getFallbackTitle,
  getGoogleFavicon,
  getMeta,
  getRuntimeFaviconCandidates,
  setPageFetch,
} from './bookmark'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  setPageFetch((url, init) => fetch(url, { ...init, redirect: 'follow' }))
})

describe('bookmark helpers', () => {
  it('builds fallback titles and favicon urls', () => {
    expect(getFallbackTitle('https://www.example.com/path')).toBe('example.com')
    expect(getFallbackTitle('not a url')).toBe('not a url')
    expect(getGoogleFavicon('https://example.com/?a=1')).toBe('https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2F%3Fa%3D1&sz=128')
    expect(getDuckDuckGoIcon('https://example.com/path')).toBe('https://icons.duckduckgo.com/ip3/example.com.ico')
    expect(getDirectFavicon('https://example.com/path/page')).toBe('https://example.com/favicon.ico')
  })

  it('dedupes runtime favicon candidates while preserving fallback order', () => {
    expect(getRuntimeFaviconCandidates('https://example.com/page', 'https://example.com/icon.png')).toEqual([
      'https://example.com/icon.png',
      'https://example.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fpage&sz=128',
    ])
  })

  it('drops stored DuckDuckGo icons so a 404 placeholder cannot block the fallback chain', () => {
    expect(getRuntimeFaviconCandidates('https://example.com/page', getDuckDuckGoIcon('https://example.com/page'))).toEqual([
      'https://example.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fpage&sz=128',
    ])
  })

  it('uses page metadata title, sends a browser user-agent, and resolves relative icons', async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/page')
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('User-Agent')).toContain('Mozilla/5.0')
      return new Response('<html><head><meta property="og:title" content="OG Title"><link rel="icon" href="/icon.png"></head></html>')
    }) as unknown as typeof fetch

    await expect(getMeta('https://example.com/page')).resolves.toEqual({
      title: 'OG Title',
      icon: 'https://example.com/icon.png',
    })
  })

  it('falls back to twitter:title and trims whitespace when og:title is missing', async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://example.com/page') {
        return new Response('<html><head><meta name="twitter:title" content="  Twitter Title  "></head></html>')
      }
      if (init?.method === 'HEAD') {
        return new Response('', { status: 404 })
      }
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch

    await expect(getMeta('https://example.com/page')).resolves.toEqual({
      title: 'Twitter Title',
      icon: getGoogleFavicon('https://example.com/page'),
    })
  })

  it('falls back to direct favicon when metadata has no icon and direct favicon loads', async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://example.com/page') {
        return new Response('<html><head><title>Page Title</title></head></html>')
      }
      if (url === 'https://example.com/favicon.ico' && init?.method === 'HEAD') {
        return new Response('', { status: 200 })
      }
      return new Response('', { status: 404 })
    }) as unknown as typeof fetch

    await expect(getMeta('https://example.com/page')).resolves.toEqual({
      title: 'Page Title',
      icon: 'https://example.com/favicon.ico',
    })
  })

  it('falls back to hostname when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch

    await expect(getMeta('https://www.example.com/page')).resolves.toEqual({
      title: 'example.com',
      icon: getGoogleFavicon('https://www.example.com/page'),
    })
  })

  it('keeps Reddit loading pages eligible for title backfill', async () => {
    globalThis.fetch = (async () => new Response('<title>Reddit</title><link rel="icon" href="/favicon.ico">')) as unknown as typeof fetch

    expect((await getMeta('https://www.reddit.com/r/expo/comments/1j4v323/')).title).toBe('reddit.com')
  })

  it('reads the requested Reddit post title instead of generic metadata or recommended posts', async () => {
    globalThis.fetch = (async () => new Response(`
      <meta property="og:title" content="Reddit - Dive into anything">
      <shreddit-post id="t3_other" post-title="Recommended post"></shreddit-post>
      <shreddit-post id="t3_1j4v323" post-title="Actual &amp; complete title"></shreddit-post>
      <link rel="icon" href="/favicon.ico">
    `)) as unknown as typeof fetch

    expect((await getMeta('https://www.reddit.com/r/expo/comments/1j4v323/comment/mit9b2a/')).title).toBe('Actual & complete title')
  })

  it('reads rendered Reddit headings and old Reddit post titles', async () => {
    for (const html of [
      '<shreddit-post id="t3_abc123"><h1 slot="title">Actual title</h1></shreddit-post>',
      '<div class="thing" data-fullname="t3_abc123"><a class="title">Actual title</a></div>',
    ]) {
      globalThis.fetch = (async () => new Response(`<title>Reddit</title>${html}<link rel="icon" href="/favicon.ico">`)) as unknown as typeof fetch
      expect((await getMeta('https://old.reddit.com/r/test/comments/abc123/')).title).toBe('Actual title')
    }
  })

  it('uses the resolved permalink to extract titles from Reddit share links', async () => {
    setPageFetch(async () => {
      const response = new Response('<title>Reddit</title><shreddit-post id="t3_abc123" post-title="Shared post"></shreddit-post><link rel="icon" href="/favicon.ico">')
      Object.defineProperty(response, 'url', { value: 'https://www.reddit.com/r/test/comments/abc123/title/' })
      return response
    })

    expect((await getMeta('https://www.reddit.com/r/test/s/shareToken')).title).toBe('Shared post')
  })

  it('skips blank or generic metadata and tries the next title candidate', async () => {
    globalThis.fetch = (async () => new Response('<meta property="og:title" content="  "><title>Actual title</title><link rel="icon" href="/favicon.ico">')) as unknown as typeof fetch
    expect((await getMeta('https://example.com/page')).title).toBe('Actual title')
  })

  it('does not apply Reddit title rules to other hosts', async () => {
    globalThis.fetch = (async () => new Response('<title>Reddit</title><link rel="icon" href="/favicon.ico">')) as unknown as typeof fetch
    expect((await getMeta('https://reddit.com.example.com/page')).title).toBe('Reddit')
  })

  it('does not parse non-document responses as html', async () => {
    globalThis.fetch = (async () =>
      new Response('binary', { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch

    await expect(getMeta('https://www.example.com/photo.png')).resolves.toEqual({
      title: 'example.com',
      icon: getGoogleFavicon('https://www.example.com/photo.png'),
    })
  })

  it('falls back to generated Google favicon when fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    await expect(getMeta('https://www.example.com/page')).resolves.toEqual({
      title: 'example.com',
      icon: getGoogleFavicon('https://www.example.com/page'),
    })
  })

  it('routes requests through an injected fetch (desktop goes through Go)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('blocked by CORS')
    }) as unknown as typeof fetch
    setPageFetch(async (url, init) => {
      if (url !== 'https://example.com/page') {
        return new Response('', { status: 404 })
      }
      expect(init.method).toBe('GET')
      return new Response('<html><head><title>Injected Title</title></head></html>')
    })

    await expect(getMeta('https://example.com/page')).resolves.toEqual({
      title: 'Injected Title',
      icon: 'https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fexample.com%2Fpage&sz=128',
    })
  })
})
