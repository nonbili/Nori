import { afterEach, expect, it } from 'bun:test'
import { createNgSocialClient } from './ng-social-post'
import type { StoredPostResponse } from './sns-schema'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const id = 'a'.repeat(64)
const assetId = 'b'.repeat(64)
const url = 'https://bsky.app/profile/alice.test/post/3n27yge3hys24'
const response: StoredPostResponse = {
  version: 1, postId: id, fetchedAt: '2026-11-15T00:00:00Z',
  post: {
    identity: { provider: 'bluesky', id: 'at://test/post/1' }, url,
    author: { identity: { provider: 'bluesky', id: 'did:plc:alice' }, displayName: '日本語 🎉', handle: 'alice.test', avatar: { id: assetId, url: `/v1/sns/assets/${assetId}`, contentType: 'image/png', byteLength: 2 } },
    content: { text: 'Server text', offsetEncoding: 'utf16', entities: [{ type: 'bold', start: 0, end: 6 }] },
    createdAt: '2026-11-15T00:00:00Z',
    media: [{ type: 'video', availability: 'preview', alt: 'Thumbnail', thumbnail: { id: assetId, url: `/v1/sns/assets/${assetId}`, contentType: 'image/png', byteLength: 2 } }],
    links: [], relations: [{ type: 'quote', target: { provider: 'bluesky', id: 'at://deleted' }, state: 'unavailable', reason: 'deleted' }],
  },
}
it('sends only a URL with the user session and downloads original assets from the fixed NG origin', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (input: string, init: RequestInit) => {
    calls.push({ url: input, init })
    return input.includes('/assets/')
      ? new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })
      : Response.json(response)
  }) as typeof fetch
  const client = createNgSocialClient('https://ng.test', async () => 'user-session')
  const saved = await client.save(url)
  expect(saved.post.author).toBe('日本語 🎉')
  expect(saved.post.media[0].type).toBe('video')
  expect(saved.post.nested).toBeUndefined()
  expect(saved.post.relations?.[0].state).toBe('unavailable')
  expect(saved.post.richText?.entities[0].type).toBe('bold')
  expect(saved.remote?.post).toEqual(response.post)
  expect(calls[0].url).toBe('https://ng.test/v1/sns/saves')
  expect(calls[0].init.body).toBe(JSON.stringify({ url }))
  expect(calls[0].init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer user-session' })
  expect(await client.image({ ...saved.post.media[0], url: 'https://evil.test/image' })).toBe('data:image/png;base64,AQI=')
  expect(calls[1].url).toBe(`https://ng.test/v1/sns/posts/${id}/assets/${assetId}`)
  expect(calls[1].init.headers).toEqual({ Authorization: 'Bearer user-session' })
  expect((await client.get(id)).postId).toBe(id)
  expect(calls[2].url).toBe(`https://ng.test/v1/sns/posts/${id}`)
  expect(calls.every((call) => call.init.redirect === 'error')).toBe(true)
})
it('rejects invalid IDs before making a request and rejects failed provider responses', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response(null, { status: 422 }) }) as unknown as typeof fetch
  const client = createNgSocialClient('https://ng.test', async () => 'user-session')
  expect(() => client.get('../object')).toThrow()
  await expect(client.image({ type: 'image', url: 'https://evil.test' })).rejects.toThrow()
  expect(calls).toBe(0)
  await expect(client.save(url)).rejects.toThrow('social_sync_http_422')
})

it('decodes another provider without discarding entities, relationship kinds or link-card assets', async () => {
  const { postAssets } = await import('./social-post')
  const { normalizeRichText } = await import('./sns-schema')
  const value = structuredClone(response)
  value.post.identity = { provider: 'mastodon', id: '123', origin: 'https://social.example' }
  value.post.author.identity = { provider: 'mastodon', id: '456', origin: 'https://social.example' }
  value.post.title = normalizeRichText('Title')
  value.post.contentWarning = normalizeRichText('Warning')
  value.post.sensitive = true
  value.post.extensions = { 'mastodon:poll': { options: ['One', 'Two'] } }
  value.post.links = [{ url: 'https://card.example', title: 'Card', description: 'Description', thumbnail: value.post.author.avatar }]
  const child = { ...structuredClone(value.post), identity: { provider: 'reddit', id: 'child' }, relations: [], links: [], media: [] }
  value.post.relations = [
    { type: 'reply', state: 'reference', target: { provider: 'mastodon', id: 'parent', origin: 'https://social.example' } },
    { type: 'crosspost', state: 'available', target: child.identity, post: child },
  ]
  globalThis.fetch = (async () => Response.json(value)) as unknown as typeof fetch
  const saved = await createNgSocialClient('https://ng.test', async () => 'session').save(url)
  expect(saved.post.site).toBe('mastodon')
  expect(saved.post.title?.text).toBe('Title')
  expect(saved.post.contentWarning?.text).toBe('Warning')
  expect(saved.post.sensitive).toBe(true)
  expect(saved.post.links?.[0].thumbnail?.postId).toBe(id)
  expect(saved.post.relations?.map((relation) => relation.type)).toEqual(['reply', 'crosspost'])
  expect(saved.post.relations?.[1].post?.site).toBe('reddit')
  expect(saved.remote?.post).toEqual(value.post)
  expect(postAssets(saved.post)).toHaveLength(4)
})

it('preserves the existing local save on an unknown post schema version instead of installing or republishing it', async () => {
  const { syncSocialPosts } = await import('./social-post-sync')
  const { socialKey } = await import('./social-post')
  const local = { description: '', imageUrl: '', imageUri: '', savedAt: 10, owner: 'alice',
    savedPost: { owner: 'alice', savedAt: 10, post: { site: 'bluesky', url, author: 'Local', text: 'Keep this', media: [] } } }
  let writes = 0
  let refs = 0
  let requests = 0
  globalThis.fetch = (async () => { requests++; return Response.json({ ...response, version: 2 }) }) as unknown as typeof fetch
  const client = createNgSocialClient('https://ng.test', async () => 'session')
  await syncSocialPosts('alice', [{ id: 'bookmark', url }], {
    ...client, read: async (key) => key === socialKey(url) ? local : undefined,
    write: async () => { writes++ }, setRef: () => { refs++ }, changed: () => {}, isCurrent: () => true,
  })
  expect(requests).toBe(1)
  expect(writes).toBe(0)
  expect(refs).toBe(0)
  expect(local.savedPost.post.text).toBe('Keep this')
})

it('preserves the Cloudflare Tunnel /api prefix for saves, post reads and asset downloads', async () => {
  const urls: string[] = []
  globalThis.fetch = (async (input: string) => {
    urls.push(input)
    return input.includes('/assets/') ? new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }) : Response.json(response)
  }) as typeof fetch
  for (const origin of ['https://ng.inks.page/api', 'https://ng.inks.page/api/']) {
    const client = createNgSocialClient(origin, async () => 'session')
    const value = await client.save(url)
    await client.get(id)
    await client.image(value.post.media[0])
    expect(value.post.media[0].url).toBe(`https://ng.inks.page/api/v1/sns/posts/${id}/assets/${assetId}`)
  }
  expect(urls).toEqual(Array.from({ length: 2 }, () => [
    'https://ng.inks.page/api/v1/sns/saves', `https://ng.inks.page/api/v1/sns/posts/${id}`,
    `https://ng.inks.page/api/v1/sns/posts/${id}/assets/${assetId}`,
  ]).flat())
})
