import { expect, it } from 'bun:test'
import { createClient } from '@supabase/supabase-js'
import { createSocialPostStore, decodePrivatePost, socialMediaPath, SavedPostNotFoundError, type PrivateSocialPost } from './social-post-store'

const userId = '11111111-1111-4111-8111-111111111111'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const image = 'data:image/png;base64,AQID'
const value: PrivateSocialPost = { id, version: 1, capturedAt: 10,
  post: { site: 'reddit', url: 'https://reddit.com/comments/abc', author: 'Alice', text: 'Private', media: [
    { type: 'image', url: 'https://cdn.example/image', cacheKey: 'file:///another-account', assetId: 'old-ng-asset', postId: 'old-ng-post' },
  ] } }
function fixture() {
  let current = true
  let fail = ''
  let missing = false
  const calls: { path: string; method: string; body: string; headers: Headers }[] = []
  const client = createClient('https://supabase.example', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (async (input, init) => {
      const url = new URL(String(input))
      const call = { path: url.pathname + url.search, method: init?.method || 'GET', body: typeof init?.body === 'string' ? init.body : '', headers: new Headers(init?.headers) }
      calls.push(call)
      if (fail && url.pathname.includes(fail)) return new Response('{"message":"denied"}', { status: 403, headers: { 'Content-Type': 'application/json' } })
      if (url.pathname.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/private?token=secret' })
      if (url.pathname === '/rest/v1/saved_posts' && call.method === 'GET') return Response.json(missing ? [] : { id, version: 1, captured_at: new Date(10).toISOString(), created_at: new Date().toISOString(), data: value.post })
      return Response.json({})
    }) as typeof fetch,
  } })
  const store = createSocialPostStore(client, userId, () => current, async (url) => {
    expect(url).toContain('https://supabase.example/storage/v1/object/sign/private?token=secret')
    return image
  })
  return { store, calls, switchAccount: () => { current = false }, fail: (path: string) => { fail = path }, removeRow: () => { missing = true } }
}
it('uploads cached media before inserting a private JSON row and strips device/NG asset pointers', async () => {
  const f = fixture()
  await f.store.save(value, [image])
  expect(f.calls.map((c) => c.path)).toEqual([`/storage/v1/object/nori-sns-media/${socialMediaPath(userId, id, 0)}`, '/rest/v1/saved_posts'])
  expect(f.calls[0].headers.get('x-upsert')).toBe('false')
  const row = JSON.parse(f.calls[1].body)
  expect(row.user_id).toBe(userId)
  expect(row.id).toBe(id)
  expect(row.version).toBe(1)
  expect(row.captured_at).toBe(new Date(10).toISOString())
  expect(row.data.media[0]).toEqual({ type: 'image', url: 'https://cdn.example/image' })
})
it('does not publish JSON when media upload fails', async () => {
  const f = fixture(); f.fail('/storage/')
  await expect(f.store.save(value, [image])).rejects.toBeDefined()
  expect(f.calls.some((c) => c.path === '/rest/v1/saved_posts')).toBe(false)
})
it('rejects invalid, missing, oversized or unsupported cached bytes before uploading anything', async () => {
  for (const images of [[], ['https://upstream.example/image'], ['data:image/svg+xml;base64,AQID'], ['data:image/png;base64,'], [`data:image/png;base64,${'A'.repeat(7 * 1024 * 1024)}`]]) {
    const f = fixture()
    await expect(f.store.save(value, images)).rejects.toBeDefined()
    expect(f.calls).toHaveLength(0)
  }
})
it('scopes reads to the current owner and signs only that account’s derived media paths', async () => {
  const f = fixture()
  const result = await f.store.get(id)
  expect(result.post.media[0].cacheKey).toBeUndefined()
  expect(f.calls[0].path).toContain(`user_id=eq.${userId}`)
  expect(await f.store.image(id, 0)).toBe(image)
  expect(f.calls[1].path).toBe(`/storage/v1/object/sign/nori-sns-media/${socialMediaPath(userId, id, 0)}`)
})
it('refuses operations after an account switch and rejects path injection', async () => {
  const f = fixture(); f.switchAccount()
  await expect(f.store.save(value, [image])).rejects.toThrow('social_account_changed')
  await expect(f.store.get(id)).rejects.toThrow('social_account_changed')
  await expect(f.store.image(id, 0)).rejects.toThrow('social_account_changed')
  expect(f.calls).toHaveLength(0)
  const other = fixture()
  await expect(other.store.image('../other-user/object', 0)).rejects.toThrow('invalid_saved_post')
  await expect(other.store.image(id, -1)).rejects.toThrow('invalid_saved_post')
  expect(other.calls).toHaveLength(0)
})
it('rejects future post versions without interpreting their JSON', () => {
  expect(() => decodePrivatePost({ id, version: 2, captured_at: new Date(10).toISOString(), data: value.post })).toThrow('invalid_saved_post')
})

it('does not delete an existing object when an immutable upload is rejected', async () => {
  const f = fixture(); f.fail('/storage/')
  await expect(f.store.save(value, [image])).rejects.toBeDefined()
  expect(f.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
})

it('distinguishes a missing private row from temporary or authorization failures', async () => {
  const missing = fixture(); missing.removeRow()
  await expect(missing.store.get(id)).rejects.toBeInstanceOf(SavedPostNotFoundError)
  const failed = fixture(); failed.fail('/rest/')
  try { await failed.store.get(id); throw new Error('must_fail') } catch (error) {
    expect(error).not.toBeInstanceOf(SavedPostNotFoundError)
    expect((error as Error).message).not.toBe('must_fail')
  }
})
