import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface OpenedBookmark {
  id: string
  url: string
  title: string
  icon: string
  openedAt: number
}

interface Store {
  openedBookmarks: OpenedBookmark[]
  addOpenedBookmark: (bookmark: { id: string; url: string; title: string; icon: string }) => void
  removeOpenedBookmark: (id: string) => void
  clearOpenedBookmarks: () => void
}

export const history$: Observable<Store> = observable<Store>({
  openedBookmarks: [],
  addOpenedBookmark: (bookmark) => {
    const current = history$.openedBookmarks.get()
    const filtered = current.filter((item) => item.id !== bookmark.id)
    history$.openedBookmarks.set([
      { ...bookmark, openedAt: Date.now() },
      ...filtered,
    ].slice(0, 10))
  },
  removeOpenedBookmark: (id) => {
    const current = history$.openedBookmarks.get()
    history$.openedBookmarks.set(current.filter((item) => item.id !== id))
  },
  clearOpenedBookmarks: () => {
    history$.openedBookmarks.set([])
  },
})

syncObservable(history$.openedBookmarks, {
  persist: {
    name: 'history',
    plugin: ObservablePersistMMKV,
  },
})
