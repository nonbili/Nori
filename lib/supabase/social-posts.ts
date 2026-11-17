import { notifyPreviewChange } from '@/lib/bookmark-preview'
import { readPreview, writePreview } from '@/lib/bookmark-preview-storage'
import { fetchPreviewImage } from '@/lib/preview-image'
import { singlePass } from '@/lib/screenshot-sync'
import { createSocialCleanupStore, removeOrphanedSocialPosts } from '@/lib/social-post-cleanup'
import { syncSocialPosts } from '@/lib/social-post-sync'
import { createSocialPostStore } from '@/lib/social-post-store'
import { readSocialImage } from '@/lib/social-post-image'
import { newUuid } from '@/lib/utils'
import { bookmarks$ } from '@/states/bookmarks'
import { supabaseClient } from './client'
import { beginSync, isCurrentSession } from './sync-session'

export const runSocialPostSync = singlePass(async () => {
  const session = beginSync()
  if (!session) return
  const isCurrent = () => isCurrentSession(session)
  await syncSocialPosts(session.userId, bookmarks$.bookmarks.peek(), {
    store: createSocialPostStore(supabaseClient, session.userId, isCurrent, fetchPreviewImage),
    newId: newUuid,
    readImage: readSocialImage,
    read: readPreview,
    write: async (key, preview) => { if (isCurrent()) await writePreview(key, preview) },
    setRef: (ids, ref) => { if (isCurrent()) bookmarks$.setSocialPost(ids, ref) },
    changed: notifyPreviewChange,
    isCurrent,
  })
})

export async function removeSocialPostOrphans() {
  const session = beginSync()
  if (!session) return
  const isCurrent = () => isCurrentSession(session)
  await removeOrphanedSocialPosts(createSocialCleanupStore(supabaseClient, session.userId, isCurrent),
    () => bookmarks$.bookmarks.peek(), isCurrent)
}
