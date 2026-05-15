import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { lists$ } from './lists'
import { genId } from '@/lib/utils'
import { normalizeUrlInput, parseHttpUrl } from '@/lib/url'
import {
  createRowJsonState,
  createStarterBookmarks,
  getVisibleBookmarks,
  isDeleted,
  isVisible,
  moveItemWithinVisibleSubset,
  normalizeBookmarks,
  patchRowState,
  type BookmarkRecordData,
} from '@/lib/nori-data'

export type BookmarkRecord = BookmarkRecordData

export interface BookmarkDraft {
  listId: string
  url: string
  title?: string
  icon?: string
}

interface Store {
  bookmarks: BookmarkRecord[]
  add: (draft: BookmarkDraft) => string | null
  update: (id: string, draft: Partial<BookmarkDraft>) => void
  remove: (id: string) => void
  setVisible: (id: string, visible: boolean) => void
  move: (id: string, delta: -1 | 1) => void
  reorder: (listId: string, orderedIds: string[]) => void
  deleteByListId: (listId: string) => void
}

function isArrayPatch(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.keys(value).every((key) => /^\d+$/.test(key))
  )
}

const resolveListId = (listId: string) => {
  const list = lists$.lists.get().find((item) => item.id === listId && !item.json.deleted_at)
  return list?.id || ''
}

const getBookmarkUrlKey = (url: string) => {
  try {
    return parseHttpUrl(url).toString()
  } catch {
    return normalizeUrlInput(url)
  }
}

export const bookmarks$: Observable<Store> = observable<Store>({
  bookmarks: createStarterBookmarks(),
  add: (draft) => {
    const url = normalizeUrlInput(draft.url)
    if (!url) {
      return null
    }

    const now = new Date().toISOString()
    const id = genId()
    const listId = resolveListId(draft.listId)
    if (!listId) {
      return null
    }

    const items = bookmarks$.bookmarks.get()
    const urlKey = getBookmarkUrlKey(url)
    const existingIndex = items.findIndex((item) => (
      item.listId === listId
      && !isDeleted(item)
      && getBookmarkUrlKey(item.url) === urlKey
    ))

    if (existingIndex !== -1) {
      const existing = items[existingIndex]
      if (!isVisible(existing)) {
        const nextItems = [...items]
        nextItems[existingIndex] = {
          ...patchRowState(existing, { visible: true }),
          updatedAt: now,
        }
        bookmarks$.bookmarks.set(nextItems)
      }
      return existing.id
    }

    const nextSortIndex = items.filter((item) => item.listId === listId).length
    bookmarks$.bookmarks.push({
      id,
      listId,
      url,
      title: draft.title?.trim() || url,
      icon: draft.icon?.trim() || '',
      json: createRowJsonState({ visible: true, sort_index: nextSortIndex, deleted_at: null }),
      createdAt: now,
      updatedAt: now,
    })
    return id
  },
  update: (id, draft) => {
    const items = bookmarks$.bookmarks.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    const previous = items[index]
    const nextListId = draft.listId ? resolveListId(draft.listId) || previous.listId : previous.listId
    const nextUrl = draft.url != null ? normalizeUrlInput(draft.url) || previous.url : previous.url
    const nextUrlKey = getBookmarkUrlKey(nextUrl)
    const duplicate = items.find((item) => (
      item.id !== id
      && item.listId === nextListId
      && !isDeleted(item)
      && getBookmarkUrlKey(item.url) === nextUrlKey
    ))
    if (duplicate) {
      return
    }

    const nextItems = [...items]
    nextItems[index] = {
      ...previous,
      url: nextUrl,
      title: draft.title?.trim() || previous.title,
      icon: draft.icon?.trim() ?? previous.icon,
      listId: nextListId,
      updatedAt: new Date().toISOString(),
    }
    bookmarks$.bookmarks.set(nextItems)
  },
  remove: (id) => {
    const items = bookmarks$.bookmarks.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    const next = patchRowState(items[index], { deleted_at: new Date().toISOString(), visible: false })
    const nextItems = [...items]
    nextItems[index] = {
      ...next,
      updatedAt: new Date().toISOString(),
    }
    bookmarks$.bookmarks.set(nextItems)
  },
  setVisible: (id, visible) => {
    const items = bookmarks$.bookmarks.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    const next = patchRowState(items[index], { visible })
    const nextItems = [...items]
    nextItems[index] = {
      ...next,
      updatedAt: new Date().toISOString(),
    }
    bookmarks$.bookmarks.set(nextItems)
  },
  move: (id, delta) => {
    const items = bookmarks$.bookmarks.get()
    const target = items.find((item) => item.id === id)
    if (!target) {
      return
    }

    const visibleIds = getVisibleBookmarks(items, target.listId).map((item) => item.id)
    const now = new Date().toISOString()
    bookmarks$.bookmarks.set(moveItemWithinVisibleSubset(items, visibleIds, id, delta).map((item) => ({
      ...item,
      updatedAt: visibleIds.includes(item.id) ? now : item.updatedAt,
    })))
  },
  reorder: (listId, orderedIds) => {
    const items = bookmarks$.bookmarks.get()
    const listItems = items.filter((item) => item.listId === listId)
    const otherItems = items.filter((item) => item.listId !== listId)

    const reordered = orderedIds
      .map((id) => listItems.find((item) => item.id === id))
      .filter((item): item is BookmarkRecord => item != null)
    const missing = listItems.filter((item) => !orderedIds.includes(item.id))
    const now = new Date().toISOString()

    const nextListItems = [...reordered, ...missing].map((item, index) => ({
      ...item,
      json: {
        ...createRowJsonState(item.json),
        sort_index: index,
      },
      updatedAt: now,
    }))

    bookmarks$.bookmarks.set([...nextListItems, ...otherItems])
  },
  deleteByListId: (listId) => {
    const now = new Date().toISOString()
    bookmarks$.bookmarks.set(
      normalizeBookmarks(
        lists$.lists.get(),
        bookmarks$.bookmarks.get().map((item) => (
          item.listId === listId
            ? {
                ...patchRowState(item, { deleted_at: now, visible: false }),
                updatedAt: now,
              }
            : item
        )),
      ),
    )
  },
})

syncObservable(bookmarks$.bookmarks, {
  persist: {
    name: 'bookmarks',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: BookmarkRecord[] | Record<string, unknown>) => {
        if (!data) {
          return data
        }
        if (isArrayPatch(data)) {
          return data
        }
        return normalizeBookmarks(lists$.lists.get(), data)
      },
    },
  },
})
