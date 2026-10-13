import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { Platform } from 'react-native'
import { genId } from '@/lib/utils'
import { settings$ } from './settings'
import {
  appendVisibleList,
  createRowJsonState,
  createStarterLists,
  getVisibleLists,
  normalizeLists,
  patchRowState,
  type BookmarkListData,
} from '@/lib/nori-data'

export type BookmarkList = BookmarkListData

interface Store {
  lists: BookmarkList[]
  addList: (name: string) => string | null
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => boolean
  restoreList: (list: BookmarkList) => void
  setVisible: (id: string, visible: boolean) => void
  reorder: (orderedIds: string[]) => void
  replaceAll: (lists: BookmarkList[]) => void
}

function ensureSelectedList() {
  const visible = getVisibleLists(lists$.lists.get())
  if (!visible.find((item) => item.id === settings$.lastSelectedListId.get())) {
    settings$.setLastSelectedListId(visible[0]?.id || '')
  }
}

export const lists$: Observable<Store> = observable<Store>({
  lists: createStarterLists(),
  addList: (name) => {
    const trimmed = name.trim()
    if (!trimmed) {
      return null
    }

    const now = new Date().toISOString()
    const id = genId()
    const nextLists = appendVisibleList(lists$.lists.get(), id, trimmed, now)
    if (!nextLists) {
      return null
    }
    lists$.lists.set(nextLists)
    ensureSelectedList()
    return id
  },
  renameList: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }

    const items = lists$.lists.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    const nextItems = [...items]
    nextItems[index] = {
      ...items[index],
      name: trimmed,
      updatedAt: new Date().toISOString(),
    }
    lists$.lists.set(nextItems)
  },
  deleteList: (id) => {
    const items = lists$.lists.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return false
    }

    const next = patchRowState(items[index], { deleted_at: new Date().toISOString(), visible: false })
    const nextItems = [...items]
    nextItems[index] = {
      ...next,
      updatedAt: new Date().toISOString(),
    }
    lists$.lists.set(nextItems)
    ensureSelectedList()
    return true
  },
  restoreList: (snapshot) => {
    const items = lists$.lists.get()
    const index = items.findIndex((item) => item.id === snapshot.id)
    const currentUpdatedAt = index === -1 ? Number.NaN : Date.parse(items[index].updatedAt)
    const now = Date.now()
    const restored = {
      ...snapshot,
      json: createRowJsonState({ ...snapshot.json, deleted_at: null }),
      updatedAt: new Date(Number.isFinite(currentUpdatedAt) ? Math.max(now, currentUpdatedAt + 1) : now).toISOString(),
    }

    if (index === -1) {
      lists$.lists.set([...items, restored])
    } else {
      const nextItems = [...items]
      nextItems[index] = restored
      lists$.lists.set(nextItems)
    }
    ensureSelectedList()
  },
  setVisible: (id, visible) => {
    const items = lists$.lists.get()
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
    lists$.lists.set(nextItems)
    ensureSelectedList()
  },
  reorder: (orderedIds) => {
    const items = lists$.lists.get()
    const reordered = orderedIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is BookmarkList => item != null)

    const missing = items.filter((item) => !orderedIds.includes(item.id))
    const now = new Date().toISOString()

    lists$.lists.set([...reordered, ...missing].map((item, index) => ({
      ...item,
      json: {
        ...createRowJsonState(item.json),
        sort_index: index,
      },
      updatedAt: now,
    })))
    ensureSelectedList()
  },
  replaceAll: (lists) => {
    lists$.lists.set(lists)
    ensureSelectedList()
  },
})

if (Platform.OS !== 'web') {
  syncObservable(lists$, {
    persist: {
      name: 'lists',
      plugin: ObservablePersistMMKV,
      transform: {
        load: (data: Partial<Store>) => {
          if (!data) {
            return data
          }
          return {
            ...data,
            lists: normalizeLists(data.lists),
          }
        },
      },
    },
  })
}
