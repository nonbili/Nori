import type { BookmarkListData, BookmarkRecordData, RowJsonState } from 'nori/lib/nori-data'

export type Theme = 'system' | 'light' | 'dark'

export type RowState = RowJsonState
export type NoriList = BookmarkListData
export type NoriBookmark = BookmarkRecordData

export interface HistoryItem {
  id: string
  url: string
  title: string
  icon: string
  openedAt: string
}

export interface ProfileData {
  ownerId?: string
  email?: string
  lists: NoriList[]
  bookmarks: NoriBookmark[]
  history: HistoryItem[]
  pendingListIds: string[]
  pendingBookmarkIds: string[]
  listsCursor?: string
  bookmarksCursor?: string
  lastFullPullAt?: number
  lastSyncAt?: number
  promotedFromAnonymous?: boolean
}

export interface Preferences {
  theme: Theme
  language: string
  lastListId: string
  showFavicons: boolean
}

export interface StoredState {
  version: 1
  activeProfileId: string
  profiles: Record<string, ProfileData>
  preferences: Preferences
}

export interface AuthState {
  loaded: boolean
  userId?: string
  email?: string
  plan: string
  source: 'none' | 'stripe' | 'app_store'
}

export interface AppSnapshot {
  profile: ProfileData
  profileId: string
  preferences: Preferences
  auth: AuthState
  syncing: boolean
  syncError?: string
}

export type BookmarkDraft = Pick<NoriBookmark, 'listId' | 'url'> &
  Partial<Pick<NoriBookmark, 'title' | 'icon'>> & { tags?: string[] }

export type RequestMessage =
  | { type: 'snapshot' }
  | { type: 'save-bookmark'; draft: BookmarkDraft }
  | { type: 'update-bookmark'; id: string; draft: Partial<BookmarkDraft> }
  | { type: 'delete-bookmark'; id: string }
  | { type: 'delete-bookmarks'; ids: string[] }
  | { type: 'restore-bookmarks'; ids: string[] }
  | { type: 'set-bookmark-visibility'; ids: string[]; visible: boolean }
  | { type: 'move-bookmarks'; ids: string[]; listId: string }
  | { type: 'open-bookmark'; id: string }
  | { type: 'clear-history' }
  | { type: 'restore-history'; items: HistoryItem[] }
  | { type: 'add-list'; name: string }
  | { type: 'rename-list'; id: string; name: string }
  | { type: 'delete-list'; id: string }
  | { type: 'restore-list'; list: NoriList; bookmarks: NoriBookmark[] }
  | { type: 'set-list-visibility'; id: string; visible: boolean }
  | { type: 'reorder-lists'; ids: string[] }
  | { type: 'reorder-bookmarks'; listId: string; ids: string[] }
  | { type: 'replace-data'; lists: NoriList[]; bookmarks: NoriBookmark[] }
  | { type: 'set-preferences'; preferences: Partial<Preferences> }
  | { type: 'sign-in' }
  | { type: 'sign-out' }
  | { type: 'sync' }

export interface ResponseMessage<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}
