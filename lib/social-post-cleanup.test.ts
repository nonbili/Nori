import { expect, it } from 'bun:test'
import { removeOrphanedSocialPosts, SOCIAL_ORPHAN_AGE_MS, type SocialCleanupStore } from './social-post-cleanup'
import type { ScreenshotBookmark } from './screenshot-sync'

const now = 2 * SOCIAL_ORPHAN_AGE_MS
function fixture() {
  const old = 1
  const removedPosts: string[] = [], removedMedia: string[] = []
  const store: SocialCleanupStore = {
    posts: async () => ['live', 'undo', 'superseded', 'deleted'].map((id) => ({ id, createdAt: old })).concat([
      { id: 'recent', createdAt: now - 1 }, { id: 'unknown', createdAt: NaN },
    ]),
    media: async () => ['live', 'undo', 'superseded', 'deleted', 'partial', 'recent', 'unknown'].map((postId) => ({ postId, path: `alice/${postId}-0`, createdAt: old })).concat([
      { postId: 'uploading', path: 'alice/uploading-0', createdAt: now - 1 },
      { postId: 'bad-date', path: 'alice/bad-date-0', createdAt: NaN },
    ]),
    removePosts: async (ids) => { removedPosts.push(...ids) },
    removeMedia: async (paths) => { removedMedia.push(...paths) },
  }
  const bookmarks: ScreenshotBookmark[] = [
    { id: 'a', url: 'https://example.com', json: { socialPost: { postId: 'live' } } },
    { id: 'b', url: 'https://example.org', json: { socialPost: { postId: 'undo' }, deleted_at: '2026-11-01' } },
  ]
  return { store, bookmarks, removedPosts, removedMedia }
}
it('cleans old unreferenced rows and orphan media while preserving live, Undo, recent, and undated captures', async () => {
  const f = fixture()
  await removeOrphanedSocialPosts(f.store, () => f.bookmarks, () => true, now)
  expect(f.removedPosts).toEqual(['superseded', 'deleted'])
  expect(f.removedMedia).toEqual(['alice/superseded-0', 'alice/deleted-0', 'alice/partial-0'])
})
it('stops cleanup when the account changes while listing', async () => {
  const f = fixture(); let current = true
  f.store.posts = async () => { current = false; return [{ id: 'old', createdAt: 1 }] }
  await removeOrphanedSocialPosts(f.store, () => f.bookmarks, () => current, now)
  expect(f.removedPosts).toHaveLength(0)
  expect(f.removedMedia).toHaveLength(0)
})
it('rechecks live references after asynchronous listing', async () => {
  const f = fixture()
  const list = f.store.media
  f.store.media = async () => {
    f.bookmarks.push({ id: 'c', url: 'https://example.net', json: { socialPost: { postId: 'superseded' } } })
    return list()
  }
  await removeOrphanedSocialPosts(f.store, () => f.bookmarks, () => true, now)
  expect(f.removedPosts).toEqual(['deleted'])
  expect(f.removedMedia).not.toContain('alice/superseded-0')
})

it('does not delete media when deleting the corresponding orphan rows fails', async () => {
  const f = fixture()
  f.store.removePosts = async () => { throw new Error('temporary_failure') }
  await expect(removeOrphanedSocialPosts(f.store, () => f.bookmarks, () => true, now)).rejects.toThrow('temporary_failure')
  expect(f.removedMedia).toHaveLength(0)
})
