import { observable } from '@legendapp/state'
import { getVisibleLists } from '@/lib/nori-data'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'

export interface BookmarkEditorState {
  id?: string
  url: string
  title: string
  icon: string
  listId: string
  tags: string[]
}

export interface ListEditorState {
  id?: string
  name: string
}

export interface PendingShareState {
  url: string
  title: string
  icon: string
}

export interface PendingBookmarkImportState {
  content: string
  name?: string | null
  mimeType?: string | null
  count: number
  isParsing?: boolean
}

interface UIStore {
  bookmarkEditMode: boolean
  bookmarkEditor: BookmarkEditorState | null
  drawerFilterListId: string
  bookmarkListAtBottom: boolean
  drawerOpen: boolean
  listEditor: ListEditorState | null
  listManagerOpen: boolean
  pendingBookmarkImport: PendingBookmarkImportState | null
  pendingShare: PendingShareState | null
  recentSheetOpen: boolean
  selectedBookmarkId: string | null
  settingsSheetOpen: boolean
  openBookmarksDrawer: () => void
}

export const ui$ = observable<UIStore>({
  bookmarkEditMode: false,
  bookmarkEditor: null,
  drawerFilterListId: 'all',
  bookmarkListAtBottom: true,
  drawerOpen: false,
  listEditor: null,
  listManagerOpen: false,
  pendingBookmarkImport: null,
  pendingShare: null,
  recentSheetOpen: false,
  selectedBookmarkId: null,
  settingsSheetOpen: false,
  openBookmarksDrawer: () => {
    const selectedListId = settings$.lastSelectedListId.get()
    const visibleLists = getVisibleLists(lists$.lists.get())
    ui$.drawerFilterListId.set(visibleLists.some((list) => list.id === selectedListId) ? selectedListId : 'all')
    ui$.drawerOpen.set(true)
  },
})
