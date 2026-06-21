import { normalizeUrlInput, parseHttpUrl } from './url'
import {
  createRowJsonState,
  isDeleted,
  isVisible,
  patchRowState,
  type BookmarkListData,
  type BookmarkRecordData,
} from './nori-data'

export interface BookmarkDraftData {
  listId: string
  url: string
  title?: string
  icon?: string
  tags?: string[]
}

export function resolveActiveListId(lists: BookmarkListData[], listId: string) {
  const list = lists.find((item) => item.id === listId && !isDeleted(item))
  return list?.id || ''
}

export function getBookmarkUrlKey(url: string) {
  try {
    return parseHttpUrl(url).toString()
  } catch {
    return normalizeUrlInput(url)
  }
}

export function addBookmarkRecord(
  lists: BookmarkListData[],
  bookmarks: BookmarkRecordData[],
  draft: BookmarkDraftData,
  id: string,
  now: string,
) {
  const url = normalizeUrlInput(draft.url)
  if (!url) {
    return null
  }

  const listId = resolveActiveListId(lists, draft.listId)
  if (!listId) {
    return null
  }

  const urlKey = getBookmarkUrlKey(url)
  const existingIndex = bookmarks.findIndex((item) => (
    item.listId === listId
    && !isDeleted(item)
    && getBookmarkUrlKey(item.url) === urlKey
  ))

  if (existingIndex !== -1) {
    const existing = bookmarks[existingIndex]
    const needsReveal = !isVisible(existing)
    if (!needsReveal && !draft.tags) {
      return { id: existing.id, bookmarks }
    }

    const nextBookmarks = [...bookmarks]
    nextBookmarks[existingIndex] = {
      ...patchRowState(existing, {
        ...(needsReveal ? { visible: true } : {}),
        ...(draft.tags ? { tags: draft.tags } : {}),
      }),
      updatedAt: now,
    }
    return { id: existing.id, bookmarks: nextBookmarks }
  }

  const nextSortIndex = bookmarks.filter((item) => item.listId === listId).length
  return {
    id,
    bookmarks: [...bookmarks, {
      id,
      listId,
      url,
      title: draft.title?.trim() || url,
      icon: draft.icon?.trim() || '',
      json: createRowJsonState({ visible: true, sort_index: nextSortIndex, deleted_at: null, tags: draft.tags }),
      createdAt: now,
      updatedAt: now,
    }],
  }
}
