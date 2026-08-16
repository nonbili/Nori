import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { addOpenedBookmarkRecord, removeOpenedBookmarkRecord, restoreOpenedBookmarkRecords } from '@/lib/history-mutations'

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
  restoreOpenedBookmarks: (bookmarks: OpenedBookmark[]) => void
}

export const history$: Observable<Store> = observable<Store>({
  openedBookmarks: [],
  addOpenedBookmark: (bookmark) => {
    history$.openedBookmarks.set(addOpenedBookmarkRecord(history$.openedBookmarks.get(), bookmark))
  },
  removeOpenedBookmark: (id) => {
    history$.openedBookmarks.set(removeOpenedBookmarkRecord(history$.openedBookmarks.get(), id))
  },
  clearOpenedBookmarks: () => {
    history$.openedBookmarks.set([])
  },
  restoreOpenedBookmarks: (bookmarks) => {
    history$.openedBookmarks.set(restoreOpenedBookmarkRecords(history$.openedBookmarks.get(), bookmarks))
  },
})

syncObservable(history$.openedBookmarks, {
  persist: {
    name: 'history',
    plugin: ObservablePersistMMKV,
  },
})
