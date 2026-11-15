import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'bun:test'
import { readSavedPost, saveSocialPost } from './saved-social-post'
import { readPreview } from './bookmark-preview-storage'
import { postAssets, postMedia } from './social-post'
import { setPreviewImageFetch, updatePreviewBookmarks } from './bookmark-preview'
import { setPageFetch } from './bookmark'
import { fetchPreviewImage } from './preview-image'

const originalFetch = globalThis.fetch
// Other suites swap these hooks out; saving goes through them.
beforeEach(() => {
  setPageFetch((url, init) => globalThis.fetch(url, init))
  setPreviewImageFetch(fetchPreviewImage)
})
afterEach(() => { globalThis.fetch = originalFetch })
it('archives Facebook crawler assets through the host transport with image validation', async () => {
  const url = 'https://www.facebook.com/alice/posts/12345/'
  await updatePreviewBookmarks([url])
  setPageFetch(async (endpoint, init) => {
    expect(init.headers?.['User-Agent']).toContain('Googlebot')
    if (endpoint.startsWith('https://lookaside.fbsbx.com/'))
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    return new Response(`<script type="application/json">${JSON.stringify({ __typename: 'Story', post_id: '12345',
      permalink_url: url, creation_time: 1794514607, actors: [{ name: 'Alice' }], message: { text: 'Offline Facebook' },
      attachments: [{ media: { __typename: 'Photo', id: '1', photo_image: {
        uri: 'https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1',
      } } }],
    })}</script>`)
  })
  setPreviewImageFetch(async () => { throw new Error('must use crawler transport') })
  const saved = await saveSocialPost(url, 'alice', () => true)
  expect((await readPreview(saved.post.media[0].cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
  expect((await readSavedPost(url, 'alice'))?.post.text).toBe('Offline Facebook')
})
it('persists Unicode and image bytes locally, isolates accounts, and reads offline', async () => {
  globalThis.fetch = (async (url: string) => {
    if (url.includes('getPostThread')) return new Response(JSON.stringify({ thread: { post: {
      uri: 'at://did:plc:alice/app.bsky.feed.post/one', author: { displayName: '日本語 🎉', avatar: 'https://cdn.test/avatar.jpg' }, record: { text: 'Saved text', createdAt: '2026-11-15T08:00:00Z' },
      embed: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.test/a.jpg' }] },
    } } }))
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
  }) as unknown as typeof fetch
  const url = 'https://bsky.app/profile/did:plc:alice/post/one'
  await updatePreviewBookmarks([url])
  const saved = await saveSocialPost(url, 'alice', () => true)
  globalThis.fetch = (() => { throw new Error('offline') }) as unknown as typeof fetch
  expect((await readSavedPost(url, 'alice'))?.post.author).toBe('日本語 🎉')
  expect(await readSavedPost(url, 'bob')).toBeUndefined()
  expect((await readPreview(postMedia(saved.post)[0].cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
  expect(postAssets(saved.post)).toHaveLength(2)
  expect((await readPreview(saved.post.avatar!.cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
  expect((await readSavedPost(url, 'alice'))?.post.createdAt).toBe('2026-11-15T08:00:00.000Z')
})
it('does not save after an account change', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ thread: { post: {
    uri: 'at://did:plc:alice/app.bsky.feed.post/cancelled', record: { text: 'Not saved' },
  } } }))) as unknown as typeof fetch
  const url = 'https://bsky.app/profile/did:plc:alice/post/cancelled'
  await updatePreviewBookmarks([url])
  await expect(saveSocialPost(url, 'alice', () => false)).rejects.toThrow('social_account_changed')
  expect(await readSavedPost(url, 'alice')).toBeUndefined()
})
it('archives an HTML-provider post and its gallery/avatar through host fetch hooks', async () => {
  const url = 'https://threads.com/@alice/post/offline'
  await updatePreviewBookmarks([url])
  setPageFetch(async (endpoint, init) => {
    expect(endpoint).toBe('https://www.threads.com/@alice/post/offline')
    expect(init.headers?.Accept).toBe('text/html')
    return new Response(`<script type="application/json">${JSON.stringify({
      code: 'offline', user: { username: 'alice', full_name: '日本語 🎉', profile_pic_url: 'https://cdn.test/avatar.jpg' },
      caption: { text: 'Offline caption' }, carousel_media: [
        { image_versions2: { candidates: [{ url: 'https://cdn.test/1.jpg' }] } },
        { media_type: 2, image_versions2: { candidates: [{ url: 'https://cdn.test/2.jpg' }] } },
      ],
    })}</script>`)
  })
  setPreviewImageFetch(async () => 'data:image/jpeg;base64,AQID')
  const saved = await saveSocialPost(url, 'alice', () => true)
  globalThis.fetch = (() => { throw new Error('offline') }) as unknown as typeof fetch
  expect((await readSavedPost(url, 'alice'))?.post.author).toBe('日本語 🎉')
  expect(saved.post.media.map((item) => item.type)).toEqual(['image', 'video'])
  for (const asset of postAssets(saved.post)) expect((await readPreview(asset.cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
})
