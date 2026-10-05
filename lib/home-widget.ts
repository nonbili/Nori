import { getFallbackTitle } from './bookmark-title'
import { getVisibleBookmarks, getVisibleLists, type BookmarkListData, type BookmarkRecordData } from './nori-data'

// A widget is a glance surface, and the snapshot is rewritten on every bookmark change.
export const WIDGET_MAX_ITEMS_PER_LIST = 100

export interface HomeWidgetOptions {
  openInSystemBrowser: boolean
  showFavicon: boolean
  strings: { chooseList: string; empty: string }
}

export interface HomeWidgetSnapshot extends HomeWidgetOptions {
  lists: {
    id: string
    name: string
    items: { title: string; url: string; icon: string }[]
  }[]
}

/** What the native home screen widget renders: visible lists with their visible bookmarks, in app order. */
export function buildHomeWidgetSnapshot(
  lists: BookmarkListData[],
  bookmarks: BookmarkRecordData[],
  options: HomeWidgetOptions,
): HomeWidgetSnapshot {
  return {
    ...options,
    lists: getVisibleLists(lists).map((list) => ({
      id: list.id,
      name: list.name,
      items: getVisibleBookmarks(bookmarks, list.id)
        .slice(0, WIDGET_MAX_ITEMS_PER_LIST)
        .map((bookmark) => ({
          title: bookmark.title || getFallbackTitle(bookmark.url),
          url: bookmark.url,
          icon: bookmark.icon,
        })),
    })),
  }
}
