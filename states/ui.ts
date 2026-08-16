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

export interface SnackbarState {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
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
  selectedBookmarkIds: string[]
  settingsSheetOpen: boolean
  snackbars: SnackbarState[]
  snackbarHosts: number[]
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
  selectedBookmarkIds: [],
  settingsSheetOpen: false,
  snackbars: [],
  snackbarHosts: [],
  openBookmarksDrawer: () => {
    const selectedListId = settings$.lastSelectedListId.get()
    const visibleLists = getVisibleLists(lists$.lists.get())
    ui$.drawerFilterListId.set(visibleLists.some((list) => list.id === selectedListId) ? selectedListId : 'all')
    ui$.drawerOpen.set(true)
  },
})

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
