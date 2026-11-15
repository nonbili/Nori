import { expect, it } from 'bun:test'
import { decodePostResponse, decodeStoredPostResponse, normalizeRichText, richTextSegments, validPost, postAssets,
  UnsupportedPostVersionError, SNS_LIMITS, type Post, type Entity, type Asset } from './sns-schema'

const asset: Asset = { id: 'a'.repeat(64), url: '/v1/sns/assets/' + 'a'.repeat(64), contentType: 'image/png', byteLength: 100 }
const post = (provider = 'mastodon', id = '123', origin = 'https://social.example'): Post => ({
  identity: { provider, id, origin }, url: `${origin}/@alice/${id}`,
  author: { identity: { provider, id: 'user-1', origin }, displayName: 'Alice' },
  content: normalizeRichText('Hello 🌏 日本語'), media: [], links: [], relations: [],
})

it('normalizes byte, UTF-16 and code-point entity offsets to identical ranges without losing Unicode', () => {
  const text = 'A🌏日本語é'
  const feature = { type: 'link' as const, url: 'https://example.com' }
  const units = [ ['utf8', 1, 11], ['utf16', 1, 5], ['codepoint', 1, 4] ] as const
  for (const [encoding, start, end] of units) {
    const normalized = normalizeRichText(text, [{ ...feature, start, end }], encoding)
    expect(normalized.entities[0]).toEqual({ ...feature, start: 1, end: 5 })
    expect(normalized.text.slice(normalized.entities[0].start, normalized.entities[0].end)).toBe('🌏日本')
    expect(normalized.text).toBe(text)
  }
})
it('supports overlapping entities, nested formatting, repeated links and safe plain-text fallback extensions', () => {
  const rich = normalizeRichText('🌏 hello hello', [
    { type: 'bold', start: 0, end: 14 }, { type: 'italic', start: 3, end: 8 },
    { type: 'link', url: 'https://one.example', start: 3, end: 8 },
    { type: 'link', url: 'https://two.example', start: 9, end: 14 },
    { type: 'extension', name: 'example:custom-mark', data: { safe: true }, start: 0, end: 2 },
  ])
  const segments = richTextSegments(rich)
  expect(segments.map((part) => part.text).join('')).toBe(rich.text)
  expect(segments.find((part) => part.text === 'hello')?.entities.map((e) => e.type)).toEqual(['bold', 'italic', 'link'])
  expect(segments.filter((part) => part.text === 'hello').map((part) => part.entities.find((e) => e.type === 'link')))
    .toMatchObject([{ url: 'https://one.example' }, { url: 'https://two.example' }])
})
it('rejects offsets inside encoded characters, malformed ranges, unsafe links and oversized entities', () => {
  for (const [encoding, start, end] of [['utf8', 1, 2], ['utf16', 0, 1], ['codepoint', 0, 3]] as const)
    expect(() => normalizeRichText('🌏', [{ type: 'bold', start, end }], encoding)).toThrow()
  for (const entity of [
    { type: 'bold', start: -1, end: 1 }, { type: 'bold', start: 1, end: 1 },
    { type: 'bold', start: 0.5, end: 2 }, { type: 'link', url: 'javascript:alert(1)', start: 0, end: 2 },
    { type: 'link', url: 'https://name:password@example.com', start: 0, end: 2 },
  ] as Entity[]) expect(() => normalizeRichText('hello', [entity])).toThrow()
  expect(() => normalizeRichText('\ud800')).toThrow()
  expect(() => normalizeRichText('hi', Array.from({ length: SNS_LIMITS.entities + 1 }, () => ({ type: 'bold', start: 0, end: 1 })))).toThrow()
})
it('accepts provider-neutral IDs, federated origins, titles, warnings, audio previews and bounded metadata', () => {
  for (const provider of ['mastodon', 'reddit', 'x', 'instagram', 'threads', 'facebook', 'tiktok', 'linkedin', 'future-provider']) {
    const value = post(provider)
    value.title = normalizeRichText('Title')
    value.contentWarning = normalizeRichText('Spoiler')
    value.sensitive = true
    value.editedAt = '2026-11-15T00:00:00Z'
    value.media = [{ type: 'image', image: asset }, { type: 'video', thumbnail: asset, availability: 'preview' },
      { type: 'audio', availability: 'preview', title: 'Audio', artwork: asset }]
    value.extensions = { [`${provider}:metadata`]: { likes: 3, poll: ['one', 'two'] } }
    expect(validPost(value)).toBe(true)
    expect(decodePostResponse({ version: 1, fetchedAt: '2026-11-15T00:00:00Z', post: value }).post).toEqual(value)
  }
})
it('enumerates every relationship and link-card asset using the same graph as access authorization', () => {
  const value = post()
  value.author.avatar = asset
  value.links.push({ url: 'https://link.example', title: 'Card', description: 'Description', thumbnail: asset })
  value.relations = ['reply', 'reply-root', 'quote', 'repost', 'crosspost'].map((type) => {
    const child = post('reddit', type, 'https://www.reddit.com')
    child.media = [{ type: 'image', image: asset }]
    return { type, target: child.identity, state: 'available', post: child }
  }) as Post['relations']
  expect(validPost(value)).toBe(true)
  expect(postAssets(value)).toHaveLength(7)
  value.relations.push({ type: 'quote', state: 'unavailable', reason: 'deleted', target: { provider: 'reddit', id: 'deleted' } })
  expect(postAssets(value)).toHaveLength(7)
  const first = value.relations[0]
  first.target = { provider: 'reddit', id: 'wrong', origin: 'https://www.reddit.com' }
  expect(validPost(value)).toBe(false)
})
it('enforces bounds on media variants, graph depth, provider metadata and scalar types', () => {
  const value = post()
  expect(validPost({ ...value, media: [{ type: 'image', thumbnail: asset }] })).toBe(false)
  expect(validPost({ ...value, media: [{ type: 'video', image: asset }] })).toBe(false)
  expect(validPost({ ...value, author: { ...value.author, identity: { provider: 'mastodon', id: 123 } } })).toBe(false)
  expect(validPost({ ...value, identity: { ...value.identity, origin: 'https://social.example/path' } })).toBe(false)
  expect(validPost({ ...value, extensions: { 'unscoped': 'value' } })).toBe(false)
  expect(validPost({ ...value, extensions: { 'example:data': 'x'.repeat(20_000) } })).toBe(false)
  let current = value
  for (let i = 0; i < SNS_LIMITS.depth + 1; i++) {
    const child = post('reddit', String(i))
    current.relations.push({ type: 'quote', target: child.identity, state: 'available', post: child })
    current = child
  }
  expect(validPost(value)).toBe(false)
})
it('dispatches by the post schema version and validates post IDs separately from payload schema', () => {
  const value = { version: 1, fetchedAt: '2026-11-15T00:00:00Z', post: post() }
  expect(decodeStoredPostResponse({ ...value, postId: 'a'.repeat(64) }).version).toBe(1)
  expect(() => decodePostResponse({ ...value, version: 2 })).toThrow(UnsupportedPostVersionError)
  expect(() => decodePostResponse({ ...value, version: undefined })).toThrow(UnsupportedPostVersionError)
  expect(() => decodePostResponse({ ...value, post: { ...value.post, content: { text: 'bad', entities: [] } } })).toThrow()
  expect(() => decodeStoredPostResponse({ ...value, postId: '../private' })).toThrow()
})

it('lets adapters drop only invalid annotations, while persisted rich text remains strictly validated', () => {
  const value = normalizeRichText('🌏 hello', [
    { type: 'bold', start: 1, end: 4 },
    { type: 'link', start: 5, end: 10, url: 'at://unsupported' },
    { type: 'bold', start: 5, end: 10 },
  ], 'utf8', 'drop')
  expect(value.text).toBe('🌏 hello')
  expect(value.entities).toEqual([{ type: 'bold', start: 3, end: 8 }])
  expect(() => normalizeRichText(value.text, [{ type: 'bold', start: 1, end: 2 }])).toThrow()
})
