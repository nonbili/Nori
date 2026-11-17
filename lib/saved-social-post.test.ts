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

it('an explicit account merge adopts complete cached captures and drops the former private row reference', async () => {
  const { adoptSavedPosts } = await import('./saved-social-post')
  const { writePreview } = await import('./bookmark-preview-storage')
  const { socialKey, socialAssetKey } = await import('./social-post')
  const url = 'https://reddit.com/comments/adopt'
  await updatePreviewBookmarks([url])
  const savedAt = 10
  await writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt, owner: 'alice', savedPost: {
    owner: 'alice', savedAt, postId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    post: { site: 'reddit', url, author: 'Alice', text: 'Local capture', media: [{ type: 'image', url: 'https://cdn.test/image' }] },
  } })
  await writePreview(socialAssetKey(url, 0), { description: '', imageUrl: 'https://cdn.test/image', imageUri: 'data:image/png;base64,AQID', savedAt, owner: 'alice' })
  await adoptSavedPosts([url], 'bob', () => true)
  expect((await readSavedPost(url, 'bob'))?.post.text).toBe('Local capture')
  expect((await readSavedPost(url, 'bob'))?.postId).toBeUndefined()
  expect((await readPreview(socialAssetKey(url, 0)))?.owner).toBe('bob')
  expect(await readSavedPost(url, 'alice')).toBeUndefined()
})

it('normalizes JPEG aliases and rejects unsupported images before reporting a successful local save', async () => {
  for (const contentType of ['image/jpg', 'image/svg+xml', 'image/x-icon', 'image/heic']) {
    const id = contentType.replace(/[^a-z]/g, '')
    const url = `https://bsky.app/profile/did:plc:alice/post/${id}`
    await updatePreviewBookmarks([url])
    globalThis.fetch = (async (endpoint: string) => endpoint.includes('getPostThread')
      ? Response.json({ thread: { post: { uri: `at://did:plc:alice/app.bsky.feed.post/${id}`, record: { text: 'Formats' },
        embed: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.test/image' }] } } } })
      : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': contentType } })) as typeof fetch
    if (contentType === 'image/jpg') {
      const saved = await saveSocialPost(url, 'alice', () => true)
      expect((await readPreview(saved.post.media[0].cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
    } else {
      await expect(saveSocialPost(url, 'alice', () => true)).rejects.toThrow('invalid_saved_post_media')
      expect(await readSavedPost(url, 'alice')).toBeUndefined()
    }
  }
})

it('shows a capture saved while signed out to a signed-in user, and forgets it for a replaced device', async () => {
  const { forgetSavedPosts } = await import('./saved-social-post')
  const { writePreview } = await import('./bookmark-preview-storage')
  const { socialKey, socialAssetKey } = await import('./social-post')
  const url = 'https://reddit.com/comments/unowned'
  await updatePreviewBookmarks([url])
  await writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: 10, owner: '', savedPost: {
    owner: '', savedAt: 10, post: { site: 'reddit', url, author: 'Alice', text: 'Signed out', media: [{ type: 'image', url: 'https://cdn.test/image' }] },
  } })
  await writePreview(socialAssetKey(url, 0), { description: '', imageUrl: 'https://cdn.test/image', imageUri: 'data:image/png;base64,AQID', savedAt: 10, owner: '' })
  expect((await readSavedPost(url, ''))?.post.text).toBe('Signed out')
  expect((await readSavedPost(url, 'alice'))?.post.text).toBe('Signed out')
  await forgetSavedPosts([url], 'alice', () => true)
  expect(await readSavedPost(url, 'alice')).toBeUndefined()
  expect((await readPreview(socialAssetKey(url, 0)))?.imageUri).toBe('')
})

it('keeps a saved post when a refresh comes back with less, and when the refresh fails', async () => {
  const url = 'https://bsky.app/profile/did:plc:alice/post/refresh'
  await updatePreviewBookmarks([url])
  let images = [{ fullsize: 'https://cdn.test/a.jpg' }, { fullsize: 'https://cdn.test/b.jpg' }]
  let failing = false
  globalThis.fetch = (async (endpoint: string) => {
    if (failing) throw new Error('offline')
    if (endpoint.includes('getPostThread')) return new Response(JSON.stringify({ thread: { post: {
      uri: 'at://did:plc:alice/app.bsky.feed.post/refresh', author: { displayName: 'Alice' }, record: { text: 'Two pictures' },
      embed: { $type: 'app.bsky.embed.images#view', images },
    } } }))
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
  }) as unknown as typeof fetch
  await saveSocialPost(url, 'alice', () => true)
  images = [images[0]]
  // Later than the first save, so only the content check can keep it.
  await new Promise((resolve) => setTimeout(resolve, 5))
  await expect(saveSocialPost(url, 'alice', () => true)).rejects.toThrow('social_post_incomplete')
  failing = true
  await expect(saveSocialPost(url, 'alice', () => true)).rejects.toThrow()
  const kept = await readSavedPost(url, 'alice')
  expect(kept?.post.media).toHaveLength(2)
  for (const item of kept!.post.media) expect((await readPreview(item.cacheKey!))?.imageUri).toBe('data:image/jpeg;base64,AQID')
})

it('compares titles and quoted posts when deciding whether a refresh shows less', async () => {
  const { losesContent } = await import('./saved-social-post')
  const base = { site: 'reddit', url: 'https://www.reddit.com/r/a/comments/1/', author: 'Alice', text: '', media: [] }
  const title = { text: 'Title only', offsetEncoding: 'utf16' as const, entities: [] }
  expect(losesContent(base, { ...base, title })).toBe(true)
  expect(losesContent({ ...base, title }, { ...base, title })).toBe(false)
  // Title and body are separate: keeping one does not make up for losing the other.
  expect(losesContent({ ...base, title }, { ...base, title, text: 'Body' })).toBe(true)
  expect(losesContent({ ...base, text: 'Body' }, { ...base, title, text: 'Body' })).toBe(true)
  const quoted = { ...base, text: 'Quoted', media: [{ type: 'image' as const, url: 'https://cdn.test/q.jpg' }] }
  expect(losesContent({ ...base, nested: { ...quoted, media: [] } }, { ...base, nested: quoted })).toBe(true)
  expect(losesContent({ ...base, nested: quoted }, { ...base, nested: quoted })).toBe(false)
  // More than before is always fine.
  expect(losesContent({ ...base, text: 'Edited', nested: quoted }, base)).toBe(false)
})

it('guards the copy saved while signed out when a signed-in refresh comes back with less', async () => {
  const { writePreview } = await import('./bookmark-preview-storage')
  const { socialKey, socialAssetKey } = await import('./social-post')
  const { UNOWNED } = await import('./social-post-sync')
  const url = 'https://bsky.app/profile/did:plc:alice/post/unowned'
  await updatePreviewBookmarks([url])
  const savedAt = 10
  await writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt, owner: UNOWNED, savedPost: {
    owner: UNOWNED, savedAt, post: { site: 'bluesky', url, author: 'Alice', text: 'Signed-out copy', media: [{ type: 'image', url: 'https://cdn.test/a.jpg' }] },
  } })
  await writePreview(socialAssetKey(url, 0), { description: '', imageUrl: 'https://cdn.test/a.jpg', imageUri: 'data:image/png;base64,AQID', savedAt, owner: UNOWNED })
  globalThis.fetch = (async () => new Response(JSON.stringify({ thread: { post: {
    uri: 'at://did:plc:alice/app.bsky.feed.post/unowned', author: { displayName: 'Alice' }, record: { text: 'Teaser' },
  } } }))) as unknown as typeof fetch
  await expect(saveSocialPost(url, 'alice', () => true)).rejects.toThrow('social_post_incomplete')
  expect((await readSavedPost(url, 'alice'))?.post.text).toBe('Signed-out copy')
})
