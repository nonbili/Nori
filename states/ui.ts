import { Platform } from 'react-native'
import { observable } from '@legendapp/state'
import { getVisibleLists, type BookmarkSortOrder } from '@/lib/nori-data'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'

export interface BookmarkEditorState {
  id?: string
  url: string
  title: string
  icon: string
  listId: string
  previewSource?: 'default' | 'page-image' | 'screenshot' | 'none'
  tags: string[]
  note: string
}

export interface ListEditorState {
  id?: string
  name: string
  sortOrder?: BookmarkSortOrder
}

export interface PendingShareItem {
  url: string
  title: string
  icon: string
}

export interface PendingShareState {
  items: PendingShareItem[]
}

export interface PendingBookmarkImportState {
  content: string
  name?: string | null
  mimeType?: string | null
  count: number
  isParsing?: boolean
}

/** A bookmark being shared as a picture of its card. */
export interface ShareImageState {
  url: string
  title: string
  icon?: string
  json?: Record<string, unknown>
}

export interface SnackbarState {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface UIStore {
  bookmarkEditMode: boolean
  bookmarkEditor: BookmarkEditorState | null
  bookmarkToolbarHeight: number
  drawerFilterListId: string
  bookmarkListAtBottom: boolean
  drawerOpen: boolean
  listEditor: ListEditorState | null
  listManagerOpen: boolean
  pendingBookmarkImport: PendingBookmarkImportState | null
  pendingShare: PendingShareState | null
  // A bookmark whose page is open in view for the user to load its preview from. Opened from the
  // bookmark editor, the pick goes back to the editor rather than to a bookmark it may not have saved yet.
  previewPage: { id: string; url: string; previewSource?: unknown; fromEditor?: boolean } | null
  // A post's page open to save the post from, after a plain fetch of it was refused.
  socialCapture: { url: string } | null
  recentSheetOpen: boolean
  // A bookmark just saved from a share, for its list to scroll into view.
  revealBookmarkId: string | null
  selectedBookmarkIds: string[]
  settingsSheetOpen: boolean
  shareImage: ShareImageState | null
  snackbars: SnackbarState[]
  snackbarHosts: number[]
  openBookmarksDrawer: () => void
}

export const ui$ = observable<UIStore>({
  bookmarkEditMode: false,
  bookmarkEditor: null,
  bookmarkToolbarHeight: 0,
  drawerFilterListId: 'all',
  bookmarkListAtBottom: true,
  drawerOpen: false,
  listEditor: null,
  listManagerOpen: false,
  pendingBookmarkImport: null,
  pendingShare: null,
  previewPage: null,
  socialCapture: null,
  recentSheetOpen: false,
  revealBookmarkId: null,
  selectedBookmarkIds: [],
  settingsSheetOpen: false,
  shareImage: null,
  snackbars: [],
  snackbarHosts: [],
  openBookmarksDrawer: () => {
    const selectedListId = settings$.lastSelectedListId.get()
    const visibleLists = getVisibleLists(lists$.lists.get())
    ui$.drawerFilterListId.set(visibleLists.some((list) => list.id === selectedListId) ? selectedListId : 'all')
    ui$.drawerOpen.set(true)
  },
})

// View capture needs a native view tree, so the web, the extension and the desktop app offer none.
export function shareBookmarkImage(bookmark: ShareImageState) {
  if (Platform.OS === 'web') return undefined
  return () => {
    ui$.drawerOpen.set(false)
    ui$.shareImage.set({ url: bookmark.url, title: bookmark.title, icon: bookmark.icon, json: bookmark.json })
  }
}

let snackbarId = 0

export const SNACKBAR_DURATION = 6000
// Every pending snackbar stays on screen, so an undo action is never queued out
// of reach. Beyond this many the oldest is dropped to keep the stack readable.
export const MAX_VISIBLE_SNACKBARS = 3

export function showSnackbar(message: string, actionLabel?: string, onAction?: () => void) {
  const id = ++snackbarId
  const next = [...ui$.snackbars.get(), { id, message, actionLabel, onAction }]
  ui$.snackbars.set(next.slice(-MAX_VISIBLE_SNACKBARS))
  // Each snackbar expires on its own schedule rather than waiting its turn.
  setTimeout(() => dismissSnackbar(id), SNACKBAR_DURATION)
}

export function dismissSnackbar(id: number) {
  ui$.snackbars.set(ui$.snackbars.get().filter((snackbar) => snackbar.id !== id))
}

let snackbarHostId = 0

// The root snackbar sits below native modals (and below react-native-web's
// portal, which renders at zIndex 9999), so sheets mount their own host and
// only the most recently mounted one renders.
export function registerSnackbarHost() {
  const id = ++snackbarHostId
  ui$.snackbarHosts.push(id)
  return {
    id,
    unregister: () => ui$.snackbarHosts.set(ui$.snackbarHosts.get().filter((host) => host !== id)),
  }
}
