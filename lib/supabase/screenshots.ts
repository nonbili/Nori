import { notifyPreviewChange } from '@/lib/bookmark-preview'
import { readPreview, writePreview } from '@/lib/bookmark-preview-storage'
import { fetchPreviewImage } from '@/lib/preview-image'
import { shrinkScreenshot } from '@/lib/screenshot-shrink'
import { createScreenshotStore, removeOrphanedScreenshots, singlePass, syncScreenshots } from '@/lib/screenshot-sync'
import { genId } from '@/lib/utils'
import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { screenshotBucket } from './client'

const store = createScreenshotStore(screenshotBucket, (url) => fetchPreviewImage(url))

export const runScreenshotSync = singlePass(async () => {
  const { userId, plan } = auth$.peek()
  if (!userId || !plan || plan === 'free') return
  await syncScreenshots(userId, bookmarks$.bookmarks.peek(), settings$.previewImageSource.peek(), {
    store,
    read: readPreview,
    write: writePreview,
    shrink: shrinkScreenshot,
    // The pass outlives a sign-out. The pointer belongs to the account that uploaded it.
    setRef: (ids, ref) => {
      if (auth$.userId.peek() === userId) bookmarks$.setScreenshot(ids, ref)
    },
    changed: notifyPreviewChange,
    newId: () => genId(16),
  })
})

export function removeOrphans(userId: string) {
  return removeOrphanedScreenshots(userId, bookmarks$.bookmarks.peek(), store)
}
