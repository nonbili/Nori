import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'
import { settings$ } from './settings'
import {
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
  setVisible: (id: string, visible: boolean) => void
  reorder: (orderedIds: string[]) => void
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
    const nextSortIndex = lists$.lists.get().length
    lists$.lists.push({
      id,
      name: trimmed,
      json: createRowJsonState({ visible: true, sort_index: nextSortIndex, deleted_at: null }),
      createdAt: now,
      updatedAt: now,
    })
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

    lists$.lists[index].assign({
      name: trimmed,
      updatedAt: new Date().toISOString(),
    })
  },
  deleteList: (id) => {
    const items = lists$.lists.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return false
    }

    const next = patchRowState(items[index], { deleted_at: new Date().toISOString(), visible: false })
    lists$.lists[index].set({
      ...next,
      updatedAt: new Date().toISOString(),
    })
    ensureSelectedList()
    return true
  },
  setVisible: (id, visible) => {
    const items = lists$.lists.get()
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    lists$.lists[index].json.set({
      ...createRowJsonState(items[index].json),
      visible,
    })
    lists$.lists[index].updatedAt.set(new Date().toISOString())
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
})

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
