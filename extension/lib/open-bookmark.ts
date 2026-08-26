import { browser } from 'wxt/browser'
import { history$ } from 'nori-root/states/history'

interface BookmarkInfo {
  id: string
  url: string
  title: string
  icon: string
}

export async function openBookmark(bookmark: BookmarkInfo) {
  history$.addOpenedBookmark(bookmark)
  await browser.tabs.create({ url: bookmark.url })
}
