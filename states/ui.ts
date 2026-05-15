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
  bookmarkListAtBottom: boolean
  drawerOpen: boolean
  listEditor: ListEditorState | null
  listManagerOpen: boolean
  pendingBookmarkImport: PendingBookmarkImportState | null
  pendingShare: PendingShareState | null
  recentSheetOpen: boolean
  selectedBookmarkId: string | null
  settingsSheetOpen: boolean
}

export const ui$ = observable<UIStore>({
  bookmarkEditMode: false,
  bookmarkEditor: null,
  bookmarkListAtBottom: true,
  drawerOpen: false,
  listEditor: null,
  listManagerOpen: false,
  pendingBookmarkImport: null,
  pendingShare: null,
  recentSheetOpen: false,
  selectedBookmarkId: null,
  settingsSheetOpen: false,
})
