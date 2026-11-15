import { notifyPreviewChange } from '@/lib/bookmark-preview'
import { readPreview, writePreview } from '@/lib/bookmark-preview-storage'
import { createScreenshotStore, removeOrphanedScreenshots, singlePass } from '@/lib/screenshot-sync'
import { shrinkScreenshot } from '@/lib/screenshot-shrink'
import { syncSocialPosts } from '@/lib/social-post-sync'
import { genId } from '@/lib/utils'
import { bookmarks$ } from '@/states/bookmarks'
import { socialPostBucket } from './client'
import { beginSync, isCurrentSession } from './sync-session'

// Only listing and removing: archives are JSON, uploaded by syncSocialPosts rather than the store.
const store = createScreenshotStore(socialPostBucket, () => Promise.reject(new Error('unsupported')))

export const runSocialPostSync = singlePass(async () => {
  const session = beginSync()
  if (!session) return
  await syncSocialPosts(session.userId, bookmarks$.bookmarks.peek(), {
    bucket: socialPostBucket,
    read: readPreview,
    write: writePreview,
    shrink: shrinkScreenshot,
    setRef: (ids, ref) => bookmarks$.setSocialPost(ids, ref),
    changed: notifyPreviewChange,
    isCurrent: () => isCurrentSession(session),
    newId: () => genId(16),
  })
})

/** Removes archives no bookmark points at any more: replaced by a newer save, or of a deleted bookmark. */
export function removeOrphanedPosts(userId: string) {
  return removeOrphanedScreenshots(userId, bookmarks$.bookmarks.peek(), store, Date.now(), 'socialPost')
}
