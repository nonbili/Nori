import { observable } from '@legendapp/state'

export interface BookmarkEditorState {
  id?: string
  url: string
  title: string
  icon: string
  listId: string
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

interface UIStore {
  bookmarkEditMode: boolean
  bookmarkEditor: BookmarkEditorState | null
  drawerOpen: boolean
  listEditor: ListEditorState | null
  listManagerOpen: boolean
  pendingShare: PendingShareState | null
  recentSheetOpen: boolean
  selectedBookmarkId: string | null
  settingsSheetOpen: boolean
}

export const ui$ = observable<UIStore>({
  bookmarkEditMode: false,
  bookmarkEditor: null,
  drawerOpen: false,
  listEditor: null,
  listManagerOpen: false,
  pendingShare: null,
  recentSheetOpen: false,
  selectedBookmarkId: null,
  settingsSheetOpen: false,
})
