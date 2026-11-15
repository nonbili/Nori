import { expect, it } from 'bun:test'
import type { BookmarkPreview } from './bookmark-preview-types'
import { socialAssetKey, socialKey, type SavedPost } from './social-post'
import { syncSocialPosts, type SocialPostRef, type SocialPostSyncHost, type SharedSocialPost } from './social-post-sync'

const url = 'https://bsky.app/profile/alice.test/post/3n27yge3hys24'
const id = 'a'.repeat(64)
const snapshot: SharedSocialPost = {
  postId: id, fetchedAt: '2026-11-15T00:00:00Z',
  post: { site: 'bluesky', url, author: 'Provider Alice', text: 'Server fetched', media: [{ type: 'image', url: 'https://ng.test/image', assetId: 'b'.repeat(64) }] },
}
const saved: SavedPost = {
  owner: 'alice', savedAt: 10,
  post: { site: 'bluesky', url, author: 'Forged Alice', text: 'Forged local text', media: [] },
}
const ref: SocialPostRef = { postId: id, savedAt: 10, url }
function device() {
  const previews = new Map<string, BookmarkPreview>()
  const refs: { ids: string[]; ref: SocialPostRef }[] = []
  const changed: string[] = []
  const requests: unknown[][] = []
  const host: SocialPostSyncHost = {
    save: async (...args) => { requests.push(args); return structuredClone(snapshot) },
    get: async (requested) => { expect(requested).toBe(id); return structuredClone(snapshot) },
    image: async () => 'data:image/png;base64,AQID',
    read: async (key) => previews.get(key),
    write: async (key, preview) => { previews.set(key, preview) },
    setRef: (ids, ref) => { refs.push({ ids, ref }) },
    changed: (key) => changed.push(key),
    isCurrent: () => true,
  }
  const seed = (value: SavedPost = saved) => previews.set(socialKey(url), {
    description: '', imageUrl: '', imageUri: '', savedAt: value.savedAt, owner: value.owner, savedPost: value,
  })
  return { host, previews, refs, changed, requests, seed }
}

it('sends only the identity and replaces local data with the trusted snapshot before syncing its reference', async () => {
  const a = device()
  a.seed()
  await syncSocialPosts('alice', [{ id: '1', url }, { id: '2', url }], a.host)
  expect(a.requests).toEqual([[url]])
  expect(a.refs).toEqual([{ ids: ['1', '2'], ref }])
  expect(a.previews.get(socialKey(url))?.savedPost?.post.text).toBe('Server fetched')
  expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBe(id)
  expect(a.previews.get(socialAssetKey(url, 0))?.imageUri).toBe('data:image/png;base64,AQID')
  expect(a.changed).toEqual([socialKey(url)])
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.requests).toHaveLength(1)
})

it('downloads a shared post on another device and owns its local cache independently', async () => {
  const b = device()
  await syncSocialPosts('bob', [{ id: '1', url, json: { socialPost: ref } }], b.host)
  expect(b.requests).toHaveLength(0)
  expect(b.previews.get(socialKey(url))?.savedPost?.owner).toBe('bob')
  expect(b.previews.get(socialKey(url))?.savedPost?.post.text).toBe('Server fetched')
})

it('keeps the local save pending if the provider or an asset is unavailable', async () => {
  for (const failure of ['save', 'image'] as const) {
    const a = device()
    a.seed()
    a.host[failure] = async () => { throw new Error('unavailable') }
    await syncSocialPosts('alice', [{ id: '1', url }], a.host)
    expect(a.refs).toHaveLength(0)
    expect(a.previews.get(socialKey(url))?.savedPost).toEqual(saved)
    expect(a.changed).toHaveLength(0)
  }
})

it('does not refetch unsaved bookmarks or upload another account’s local copy', async () => {
  const a = device()
  a.seed()
  await syncSocialPosts('bob', [{ id: '1', url }], a.host)
  expect(a.requests).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
})

it('does not install a snapshot after an account switch or a newer local save', async () => {
  for (const change of ['account', 'save']) {
    const a = device()
    a.seed()
    a.host.image = async () => {
      if (change === 'account') a.host.isCurrent = () => false
      else a.seed({ ...saved, savedAt: 11 })
      return 'data:image/png;base64,AQID'
    }
    await syncSocialPosts('alice', [{ id: '1', url }], a.host)
    expect(a.refs).toHaveLength(0)
    expect(a.changed).toHaveLength(0)
    expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBeUndefined()
  }
})

it('repairs an unverified local copy even when its timestamp equals the synced post', async () => {
  const a = device()
  a.seed()
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.requests).toHaveLength(0)
  expect(a.previews.get(socialKey(url))?.savedPost?.post.text).toBe('Server fetched')
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

it('independently saves a merged bookmark when the new account lacks the original post grant', async () => {
  const { mergeDeviceIntoAccount } = await import('./supabase/sync-merge')
  const { SocialPostHttpError } = await import('./ng-social-post')
  const a = device()
  a.seed({ ...saved, postId: id }) // The on-device archive is still Alice's.
  const merged = mergeDeviceIntoAccount([], [{ id: 'merged', listId: 'list', url, title: 'Post', icon: '',
    createdAt: '', updatedAt: '', json: { socialPost: ref } }], [], [])
  const refreshedId = 'c'.repeat(64)
  a.host.get = async () => { throw new SocialPostHttpError(404) }
  a.host.save = async (...args) => { a.requests.push(args); return { ...structuredClone(snapshot), postId: refreshedId } }
  await syncSocialPosts('bob', merged.bookmarks, a.host)
  expect(a.requests).toEqual([[url]])
  expect(a.previews.get(socialKey(url))?.savedPost?.owner).toBe('bob')
  expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBe(refreshedId)
  expect(a.refs).toEqual([{ ids: ['merged'], ref: { ...ref, postId: refreshedId } }])
})

it('does not resave on an authentication or temporary post error', async () => {
  const { SocialPostHttpError } = await import('./ng-social-post')
  for (const status of [401, 403, 503]) {
    const a = device()
    a.host.get = async () => { throw new SocialPostHttpError(status) }
    await syncSocialPosts('bob', [{ id: '1', url, json: { socialPost: ref } }], a.host)
    expect(a.requests).toHaveLength(0)
    expect(a.refs).toHaveLength(0)
    expect(a.previews.size).toBe(0)
  }
})

it('preserves a merged local copy if independently saving the URL fails', async () => {
  const { SocialPostHttpError } = await import('./ng-social-post')
  const a = device()
  a.seed()
  a.host.get = async () => { throw new SocialPostHttpError(404) }
  a.host.save = async () => { throw new SocialPostHttpError(422) }
  await syncSocialPosts('bob', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.previews.get(socialKey(url))?.savedPost).toEqual(saved)
  expect(a.refs).toHaveLength(0)
})

it('does not start an independent save after the account changes during a missing post read', async () => {
  const { SocialPostHttpError } = await import('./ng-social-post')
  const a = device()
  a.host.get = async () => { a.host.isCurrent = () => false; throw new SocialPostHttpError(404) }
  await syncSocialPosts('bob', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.requests).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
})

it('picks up a shared-row edit without bookmark changes and reuses unchanged local media', async () => {
  const a = device()
  a.seed()
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  let images = 0
  a.host.image = async () => { images++; return 'data:image/png;base64,AQID' }
  const edited = { ...structuredClone(snapshot), fetchedAt: '2026-11-15T00:01:00Z' }
  edited.post.text = 'Edited on the server'
  a.host.get = async () => structuredClone(edited)
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  const local = a.previews.get(socialKey(url))?.savedPost
  expect(local?.post.text).toBe('Edited on the server')
  expect(local?.postId).toBe(id)
  expect(local?.savedAt).toBe(10)
  expect(local?.fetchedAt).toBe(edited.fetchedAt)
  expect(images).toBe(0)
  expect(a.refs).toHaveLength(1) // Shared content refresh does not rewrite personal save references.
  const changes = a.changed.length
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.changed).toHaveLength(changes)
})

it('keeps the offline copy when a shared-row refresh fails', async () => {
  const { SocialPostHttpError } = await import('./ng-social-post')
  const a = device()
  a.seed()
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  const before = structuredClone(a.previews.get(socialKey(url)))
  a.host.get = async () => { throw new SocialPostHttpError(503) }
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.previews.get(socialKey(url))).toEqual(before)
})
