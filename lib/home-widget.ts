import { getFallbackTitle } from './bookmark-title'
import { previewKey, previewSource, type PreviewSource } from './bookmark-preview-types'
import { previewRecordFile } from './native-preview-storage'
import { getVisibleBookmarks, getVisibleLists, type BookmarkListData, type BookmarkRecordData } from './nori-data'

// A widget is a glance surface, and the snapshot is rewritten on every bookmark change.
export const WIDGET_MAX_ITEMS_PER_LIST = 100

export interface HomeWidgetOptions {
  openInSystemBrowser: boolean
  showFavicon: boolean
  previewImageSource: PreviewSource
  strings: { chooseList: string; empty: string; viewCompact: string; viewPreview: string }
}

export interface HomeWidgetSnapshot extends HomeWidgetOptions {
  lists: {
    id: string
    name: string
    /** `preview` names the cached preview record; the widget reads it only for rows it draws. */
    items: { title: string; url: string; icon: string; preview: string }[]
  }[]
}

function previewFile(bookmark: BookmarkRecordData, fallback: PreviewSource) {
  try {
    return previewRecordFile(previewKey(bookmark.url, previewSource(bookmark.json?.previewSource, fallback)))
  } catch {
    return ''
  }
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
          preview: previewFile(bookmark, options.previewImageSource),
        })),
    })),
  }
}
