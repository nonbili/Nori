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
  /** null means follow the browser UI language. */
  language: string | null
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

export type RequestMessage =
  | { type: 'snapshot' }
  | {
      type: 'replace-data'
      lists: NoriList[]
      bookmarks: NoriBookmark[]
      history?: HistoryItem[]
      preferences?: Partial<Preferences>
    }
  | { type: 'set-preferences'; preferences: Partial<Preferences> }
  | { type: 'sign-in' }
  | { type: 'sign-out' }
  | { type: 'sync' }

export interface StateChangedMessage {
  type: 'state-changed'
}

export interface ResponseMessage<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}
