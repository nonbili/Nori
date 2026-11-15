import { afterEach, expect, it } from 'bun:test'
import type { BookmarkPreview } from './bookmark-preview-types'
import { socialAssetKey, socialKey, type SavedPost } from './social-post'
import { syncSocialPosts, type SocialPostRef, type SocialPostSyncHost } from './social-post-sync'

const url = 'https://bsky.app/profile/alice.test/post/one'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function device(objects: Map<string, Uint8Array>) {
  const previews = new Map<string, BookmarkPreview>()
  const refs: { ids: string[]; ref: SocialPostRef }[] = []
  const changed: string[] = []
  const host: SocialPostSyncHost = {
    bucket: {
      upload: async (path, body) => { objects.set(path, body); return { error: null } },
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://bucket.test/${path}` }, error: null }),
    },
    read: async (key) => previews.get(key),
    write: async (key, preview) => { previews.set(key, preview) },
    shrink: async () => new Uint8Array([1, 2, 3]),
    setRef: (ids, ref) => { refs.push({ ids, ref }) },
    changed: (key) => changed.push(key),
    isCurrent: () => true,
    newId: () => 'object',
  }
  return { host, previews, refs, changed }
}

function serve(objects: Map<string, Uint8Array>) {
  globalThis.fetch = (async (input: string) => {
    const body = objects.get(input.replace('https://bucket.test/', ''))
    return body ? new Response(body as BodyInit) : new Response(null, { status: 404 })
  }) as unknown as typeof fetch
}

const saved: SavedPost = {
  owner: 'alice',
  savedAt: 10,
  post: { site: 'bluesky', url, author: 'Alice', text: 'Hello', media: [{ type: 'image', url: 'https://cdn.test/a.jpg', cacheKey: socialAssetKey(url, 0) }] },
}

it('uploads a saved post once for bookmarks of one URL, and another device downloads it', async () => {
  const objects = new Map<string, Uint8Array>()
  const a = device(objects)
  a.previews.set(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: 10, owner: 'alice', savedPost: saved })
  a.previews.set(socialAssetKey(url, 0), { description: '', imageUrl: '', imageUri: 'data:image/png;base64,AA==', savedAt: 10, owner: 'alice' })
  await syncSocialPosts('alice', [{ id: '1', url, json: {} }, { id: '2', url, json: {} }], a.host)
  expect(objects.size).toBe(1)
  expect(a.refs).toEqual([{ ids: ['1', '2'], ref: { path: 'alice/object.json', savedAt: 10, url } }])

  serve(objects)
  const b = device(objects)
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: a.refs[0].ref } }], b.host)
  expect(b.previews.get(socialKey(url))?.savedPost?.post.text).toBe('Hello')
  expect(b.previews.get(socialAssetKey(url, 0))?.imageUri).toBe('data:image/jpeg;base64,AQID')
  expect(b.changed).toEqual([socialKey(url)])
})

it('leaves the local copy alone for an archive of an unknown version or another account', async () => {
  const objects = new Map<string, Uint8Array>()
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
  objects.set('alice/v2.json', encode({ v: 2, saved, images: ['data:image/jpeg;base64,AQID'] }))
  objects.set('bob/v1.json', encode({ v: 1, saved: { ...saved, owner: 'bob' }, images: ['data:image/jpeg;base64,AQID'] }))
  serve(objects)
  const b = device(objects)
  await syncSocialPosts('alice', [
    { id: '1', url, json: { socialPost: { path: 'alice/v2.json', savedAt: 10, url } } },
    { id: '2', url: `${url}/`, json: { socialPost: { path: 'bob/v1.json', savedAt: 10, url: `${url}/` } } },
  ], b.host)
  expect(b.previews.size).toBe(0)
})

it('runs changes of one saved post one at a time', async () => {
  const { withSavedPostLock } = await import('./social-post-sync')
  const steps: string[] = []
  const step = (name: string) => async () => {
    steps.push(`${name}:start`)
    await new Promise((resolve) => setTimeout(resolve, 5))
    steps.push(`${name}:end`)
  }
  await Promise.all([withSavedPostLock(url, step('save')), withSavedPostLock(url, step('download'))])
  expect(steps).toEqual(['save:start', 'save:end', 'download:start', 'download:end'])
})
