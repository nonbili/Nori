import { history$ } from '@/states/history'
import { openUrl } from '@/lib/open-url'

interface BookmarkInfo {
  id: string
  url: string
  title: string
  icon: string
}

export async function openBookmark(bookmark: BookmarkInfo) {
  history$.addOpenedBookmark(bookmark)
  await openUrl(bookmark.url)
}
