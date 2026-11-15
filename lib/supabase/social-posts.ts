import { notifyPreviewChange } from '@/lib/bookmark-preview'
import { readPreview, writePreview } from '@/lib/bookmark-preview-storage'
import { singlePass } from '@/lib/screenshot-sync'
import { syncSocialPosts } from '@/lib/social-post-sync'
import { createNgSocialClient } from '@/lib/ng-social-post'
import { bookmarks$ } from '@/states/bookmarks'
import { supabaseAuth } from './client'
import { beginSync, isCurrentSession } from './sync-session'
import { NG_ORIGIN } from './config'

export const runSocialPostSync = singlePass(async () => {
  const session = beginSync()
  if (!session || !NG_ORIGIN) return
  const client = createNgSocialClient(NG_ORIGIN, async () => {
    const { data, error } = await supabaseAuth.getSession()
    if (error || !data.session || data.session.user.id !== session.userId || !isCurrentSession(session))
      throw new Error('social_account_changed')
    return data.session.access_token
  })
  await syncSocialPosts(session.userId, bookmarks$.bookmarks.peek(), {
    ...client,
    read: readPreview,
    write: writePreview,
    setRef: (ids, ref) => bookmarks$.setSocialPost(ids, ref),
    changed: notifyPreviewChange,
    isCurrent: () => isCurrentSession(session),
  })
})
