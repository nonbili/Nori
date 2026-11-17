import { expect, it } from 'bun:test'
import type { BookmarkPreview } from './bookmark-preview-types'
import { socialAssetKey, socialKey, type SavedPost } from './social-post'
import { syncSocialPosts, withSavedPostLock, type SocialPostRef, type SocialPostSyncHost } from './social-post-sync'
import { SavedPostNotFoundError, SOCIAL_ORPHAN_AGE_MS, type PrivateSocialPost } from './social-post-store'

const url = 'https://www.reddit.com/r/example/comments/abc/post/'
const id = '11111111-1111-4111-8111-111111111111'
const image = 'data:image/png;base64,AQID'
const saved: SavedPost = { owner: 'alice', savedAt: 10,
  post: { site: 'reddit', url, author: 'Alice', text: 'Captured on my device', media: [{ type: 'image', url: 'https://cdn.example/image.png', cacheKey: socialAssetKey(url, 0) }] } }
const ref: SocialPostRef = { postId: id, savedAt: 10, url }
function device() {
  const previews = new Map<string, BookmarkPreview>()
  const refs: { ids: string[]; ref: SocialPostRef }[] = []
  const uploads: { value: PrivateSocialPost; images: string[] }[] = []
  const changes: string[] = []
  let gets = 0
  const host: SocialPostSyncHost = {
    newId: () => id,
    readImage: async (uri) => uri,
    store: {
      save: async (value, images) => { uploads.push(structuredClone({ value, images })) },
      get: async () => { gets++; return { id, version: 1, capturedAt: 10, createdAt: Date.now(), post: structuredClone(saved.post) } },
      image: async () => image,
    },
    read: async (key) => previews.get(key),
    write: async (key, value) => { previews.set(key, structuredClone(value)) },
    setRef: (ids, ref) => { refs.push({ ids, ref }) },
    changed: (key) => changes.push(key),
    isCurrent: () => true,
  }
  function seed(value = saved) {
    previews.set(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: value.savedAt, owner: value.owner, savedPost: structuredClone(value) })
    previews.set(socialAssetKey(url, 0), { description: '', imageUrl: value.post.media[0].url, imageUri: image, savedAt: value.savedAt, owner: value.owner })
  }
  return { host, previews, refs, uploads, changes, seed, gets: () => gets }
}

it('uploads the local capture and cached bytes, then shares its reference across duplicate bookmarks', async () => {
  const a = device(); a.seed()
  await syncSocialPosts('alice', [{ id: '1', url }, { id: '2', url }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.uploads[0].value.post.text).toBe(saved.post.text)
  expect(a.uploads[0].value.post.media[0].cacheKey).toBeUndefined()
  expect(a.uploads[0].images).toEqual([image])
  expect(a.refs).toEqual([{ ids: ['1', '2'], ref }])
  expect(a.previews.get(socialKey(url))?.savedPost?.post.text).toBe(saved.post.text)
  expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBe(id)
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.gets()).toBe(1) // Check cloud existence so a missing capture can be repaired.
})

it('downloads a capture and media on another device for the same account', async () => {
  const b = device()
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], b.host)
  expect(b.uploads).toHaveLength(0)
  expect(b.previews.get(socialKey(url))?.savedPost?.owner).toBe('alice')
  expect(b.previews.get(socialKey(url))?.savedPost?.post.text).toBe(saved.post.text)
  expect(b.previews.get(socialAssetKey(url, 0))?.imageUri).toBe(image)
  expect(b.changes).toEqual([socialKey(url)])
})

it('keeps the capture pending when upload fails or cached media is missing or belongs to someone else', async () => {
  for (const failure of ['upload', 'missing', 'owner', 'timestamp']) {
    const a = device(); a.seed()
    if (failure === 'upload') a.host.store.save = async () => { throw new Error('upload_failed') }
    else if (failure === 'missing') a.previews.delete(socialAssetKey(url, 0))
    else a.previews.set(socialAssetKey(url, 0), { ...a.previews.get(socialAssetKey(url, 0))!, ...(failure === 'owner' ? { owner: 'bob' } : { savedAt: 11 }) })
    await syncSocialPosts('alice', [{ id: '1', url }], a.host)
    expect(a.refs).toHaveLength(0)
    expect(a.previews.get(socialKey(url))?.savedPost).toEqual(saved)
  }
})

it('does not upload another account’s local copy, deleted bookmarks, or unsaved URLs', async () => {
  const a = device(); a.seed()
  await syncSocialPosts('bob', [{ id: '1', url }], a.host)
  await syncSocialPosts('alice', [{ id: '1', url, json: { deleted_at: '2026-01-01' } }, { id: '2', url: 'https://example.com' }], a.host)
  expect(a.uploads).toHaveLength(0)
})

it('does not publish an upload after an account switch or newer local capture', async () => {
  for (const change of ['account', 'capture']) {
    const a = device(); a.seed()
    a.host.store.save = async () => {
      if (change === 'account') a.host.isCurrent = () => false
      else a.seed({ ...saved, savedAt: 11 })
    }
    await syncSocialPosts('alice', [{ id: '1', url }], a.host)
    expect(a.refs).toHaveLength(0)
    expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBeUndefined()
  }
})

it('retries bookmark publication without uploading a completed capture again', async () => {
  const a = device(); a.seed()
  a.host.setRef = () => { throw new Error('bookmark_write_failed') }
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  a.host.setRef = (ids, ref) => { a.refs.push({ ids, ref }) }
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.refs).toEqual([{ ids: ['1'], ref }])
})

it('keeps the old offline capture when a download fails, changes account, or races a newer save', async () => {
  for (const failure of ['image', 'account', 'capture']) {
    const a = device(); a.seed({ ...saved, savedAt: 5 })
    a.host.store.image = async () => {
      if (failure === 'image') throw new Error('download_failed')
      if (failure === 'account') a.host.isCurrent = () => false
      else a.seed({ ...saved, savedAt: 11 })
      return image
    }
    await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
    expect(a.previews.get(socialKey(url))?.savedPost?.savedAt).toBe(failure === 'capture' ? 11 : 5)
    expect(a.changes).toHaveLength(0)
  }
})

it('rejects unknown formats and mismatched capture references before downloading media', async () => {
  for (const patch of [{ version: 2 }, { id: '22222222-2222-4222-8222-222222222222' }, { capturedAt: 11 }]) {
    const a = device()
    a.host.store.get = async () => ({ id, version: 1, capturedAt: 10, post: structuredClone(saved.post), ...patch })
    a.host.store.image = async () => { throw new Error('must_not_download') }
    await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
    expect(a.previews.size).toBe(0)
  }
})

it('does not fall back to a provider fetch when a private post is missing or access is denied', async () => {
  const a = device()
  a.host.store.get = async () => { throw new Error('not_found') }
  await syncSocialPosts('bob', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.uploads).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
})

it('uploads an existing local NG archive into private storage without contacting NG', async () => {
  const a = device(); a.seed({ ...saved, postId: 'a'.repeat(64) })
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: { ...ref, postId: 'a'.repeat(64) } } }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.refs[0].ref).toEqual(ref)
})

it('runs changes of one saved post one at a time', async () => {
  const steps: string[] = []
  const step = (name: string) => async () => { steps.push(`${name}:start`); await Bun.sleep(5); steps.push(`${name}:end`) }
  await Promise.all([withSavedPostLock(url, step('save')), withSavedPostLock(url, step('download'))])
  expect(steps).toEqual(['save:start', 'save:end', 'download:start', 'download:end'])
})

it('reuploads a cached private capture if its row was cleaned before reference publication', async () => {
  for (const published of [false, true]) {
    const a = device(); a.seed({ ...saved, postId: id })
    const replacement = '22222222-2222-4222-8222-222222222222'
    a.host.newId = () => replacement
    a.host.store.get = async () => { throw new SavedPostNotFoundError() }
    await syncSocialPosts('alice', [{ id: '1', url, ...(published ? { json: { socialPost: ref } } : {}) }], a.host)
    expect(a.uploads).toHaveLength(1)
    expect(a.uploads[0].images).toEqual([image])
    expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBe(replacement)
    expect(a.refs).toEqual([{ ids: ['1'], ref: { ...ref, postId: replacement } }])
  }
})
it('does not republish an unpublished cached row that is old enough for concurrent cleanup', async () => {
  const a = device(); a.seed({ ...saved, postId: id })
  a.host.newId = () => '22222222-2222-4222-8222-222222222222'
  a.host.store.get = async () => ({ id, version: 1, capturedAt: 10, post: saved.post, createdAt: Date.now() - SOCIAL_ORPHAN_AGE_MS })
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.refs[0].ref.postId).not.toBe(id)
})
it('preserves local state on temporary existence-check errors and never restores older content over a missing newer capture', async () => {
  const a = device(); a.seed({ ...saved, postId: id })
  a.host.store.get = async () => { throw new Error('temporary_failure') }
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.uploads).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
  expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBe(id)
  a.host.store.get = async () => { throw new SavedPostNotFoundError() }
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: { ...ref, savedAt: 11 } } }], a.host)
  expect(a.uploads).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
})
it('leaves a cleaned capture pending if its local media is incomplete', async () => {
  const a = device(); a.seed({ ...saved, postId: id })
  a.previews.delete(socialAssetKey(url, 0))
  a.host.store.get = async () => { throw new SavedPostNotFoundError() }
  await syncSocialPosts('alice', [{ id: '1', url, json: { socialPost: ref } }], a.host)
  expect(a.uploads).toHaveLength(0)
  expect(a.refs).toHaveLength(0)
  expect(a.previews.get(socialKey(url))?.savedPost?.post.text).toBe(saved.post.text)
  expect(a.previews.get(socialKey(url))?.savedPost?.postId).toBeUndefined()
})

it('claims a capture saved while signed out, then uploads it', async () => {
  const a = device(); a.seed({ ...saved, owner: '' })
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.uploads).toHaveLength(1)
  expect(a.refs).toEqual([{ ids: ['1'], ref }])
  expect(a.previews.get(socialKey(url))?.savedPost?.owner).toBe('alice')
  expect(a.previews.get(socialAssetKey(url, 0))?.owner).toBe('alice')
})

it('does not claim another account’s capture during sync', async () => {
  const a = device(); a.seed({ ...saved, owner: 'bob' })
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.uploads).toHaveLength(0)
  expect(a.previews.get(socialKey(url))?.savedPost?.owner).toBe('bob')
})

it('finishes an adoption cut short after handing over some media, and reports the change', async () => {
  const a = device(); a.seed({ ...saved, owner: '' })
  a.previews.set(socialAssetKey(url, 0), { ...a.previews.get(socialAssetKey(url, 0))!, owner: 'alice' })
  await syncSocialPosts('alice', [{ id: '1', url }], a.host)
  expect(a.previews.get(socialKey(url))?.savedPost?.owner).toBe('alice')
  expect(a.uploads).toHaveLength(1)
  expect(a.changes).toContain(socialKey(url))
})
