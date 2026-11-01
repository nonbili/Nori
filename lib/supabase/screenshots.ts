import { notifyPreviewChange } from '@/lib/bookmark-preview'
import { readPreview, writePreview } from '@/lib/bookmark-preview-storage'
import { fetchPreviewImage } from '@/lib/preview-image'
import { shrinkScreenshot } from '@/lib/screenshot-shrink'
import { createScreenshotStore, removeOrphanedScreenshots, singlePass, syncScreenshots } from '@/lib/screenshot-sync'
import { genId } from '@/lib/utils'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { screenshotBucket } from './client'
import { beginSync, isCurrentSession } from './sync-session'

const store = createScreenshotStore(screenshotBucket, (url) => fetchPreviewImage(url))

export const runScreenshotSync = singlePass(async () => {
  const session = beginSync()
  if (!session) return
  const { userId } = session
  await syncScreenshots(userId, bookmarks$.bookmarks.peek(), settings$.previewImageSource.peek(), {
    store,
    read: readPreview,
    // The pass outlives a change of account, and what it fetched is not the next account's.
    write: async (key, preview) => {
      if (isCurrentSession(session)) await writePreview(key, preview)
    },
    shrink: shrinkScreenshot,
    setRef: (ids, ref) => {
      if (isCurrentSession(session)) bookmarks$.setScreenshot(ids, ref)
    },
    changed: notifyPreviewChange,
    newId: () => genId(16),
  })
})

export function removeOrphans(userId: string) {
  return removeOrphanedScreenshots(userId, bookmarks$.bookmarks.peek(), store)
}
