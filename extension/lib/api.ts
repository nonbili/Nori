import { createClient } from '@supabase/supabase-js'
import { browser } from 'wxt/browser'
import { mergeRows, createProfile } from './domain'
import { readPreview, writePreview } from 'nori/lib/bookmark-preview-storage'
import { fetchNoriMe } from 'nori/lib/nori-api'
import { normalizeBookmarks, normalizeLists } from 'nori/lib/nori-data'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from 'nori/lib/supabase/config'
import {
  collectUnsyncedRowIds,
  dropExpiredSyncTombstones,
  isPristineStarterSeed,
  nextSyncCursor,
} from 'nori/lib/supabase/sync-merge'
import { collectPagedRows, keysetFilter, SYNC_PAGE_SIZE } from 'nori/lib/supabase/sync-paging'
import {
  toBatches,
  toLocalBookmark,
  toLocalList,
  toRemoteBookmark,
  toRemoteList,
  type RemoteBookmarkRow,
  type RemoteListRow,
} from 'nori/lib/supabase/sync-rows'
import { fetchPreviewImage } from 'nori/lib/preview-image'
import { shrinkScreenshot } from 'nori/lib/screenshot-shrink'
import {
  createScreenshotStore,
  removeOrphanedScreenshots,
  SCREENSHOT_BUCKET,
  syncScreenshots,
  type ScreenshotRef,
} from 'nori/lib/screenshot-sync'
import { supabaseStorage } from './storage'
import type { AuthState, NoriBookmark, NoriList, Preferences, ProfileData, StoredState } from './model'

const AUTH_HOST = 'https://nori.inks.page/auth/extension'

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: supabaseStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
const db = client.schema('nori')
const screenshotStore = createScreenshotStore(client.storage.from(SCREENSHOT_BUCKET), (url) => fetchPreviewImage(url))

export async function getAuthState(): Promise<AuthState> {
  const { data } = await client.auth.getSession()
  const session = data.session
  if (!session) return { loaded: true, plan: 'free', source: 'none' }
  try {
    const entitlement = await fetchNoriMe(session.access_token)
    return {
      loaded: true,
      userId: session.user.id,
      email: session.user.email,
      plan: entitlement.plan || 'free',
      source: entitlement.source || 'none',
    }
  } catch {
    return { loaded: true, userId: session.user.id, email: session.user.email, plan: 'free', source: 'none' }
  }
}

export async function hostedSignIn() {
  if (import.meta.env.FIREFOX) {
    const accepted = await (browser.permissions.request as any)({
      data_collection: ['personallyIdentifyingInfo', 'authenticationInfo', 'browsingActivity'],
    })
    if (!accepted) throw new Error('Data permission is required for Nori cloud sync')
  }
  const state = crypto.randomUUID()
  const redirect = browser.identity.getRedirectURL('auth')
  const authUrl = new URL(AUTH_HOST)
  authUrl.searchParams.set('redirect_uri', redirect)
  authUrl.searchParams.set('state', state)
  const callback = await browser.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true })
  if (!callback) throw new Error('Sign-in was cancelled')
  const result = new URL(callback)
  if (result.searchParams.get('state') !== state) throw new Error('Invalid sign-in state')
  const error = result.searchParams.get('error_description') || result.searchParams.get('error')
  if (error) throw new Error(error)
  const token = result.searchParams.get('t')
  if (!token) throw new Error('Sign-in token missing')
  const { error: verifyError } = await client.auth.verifyOtp({ token_hash: token, type: 'email' })
  if (verifyError) throw verifyError
  return getAuthState()
}

export async function signOut() {
  await client.auth.signOut({ scope: 'local' })
}

async function fetchRows<T extends { id: string; updated_at: string }>(
  table: 'lists' | 'bookmarks',
  columns: string,
  cursor?: string,
) {
  return collectPagedRows<T>(async (keyset) => {
    let query = db
      .from(table)
      .select(columns)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(SYNC_PAGE_SIZE)
    if (keyset) query = query.or(keysetFilter(keyset))
    else if (cursor) query = query.gt('updated_at', cursor)
    const { data, error } = await query
    if (error) throw error
    return (data || []) as unknown as T[]
  })
}

async function upsertLists(userId: string, rows: NoriList[]) {
  const pushed: NoriList[] = []
  for (const batch of toBatches(rows, SYNC_PAGE_SIZE)) {
    const { data, error } = await db
      .from('lists')
      .upsert(
        batch.map((row) => toRemoteList(userId, row)),
        { onConflict: 'user_id,id' },
      )
      .select('id,name,json,created_at,updated_at')
    if (error) throw error
    pushed.push(...(data || []).map((row) => toLocalList(row as RemoteListRow)))
  }
  return pushed
}

async function upsertBookmarks(userId: string, rows: NoriBookmark[]) {
  const pushed: NoriBookmark[] = []
  for (const batch of toBatches(rows, SYNC_PAGE_SIZE)) {
    const { data, error } = await db
      .from('bookmarks')
      .upsert(
        batch.map((row) => toRemoteBookmark(userId, row)),
        { onConflict: 'user_id,id' },
      )
      .select('id,list_id,url,title,icon,json,created_at,updated_at')
    if (error) throw error
    pushed.push(...(data || []).map((row) => toLocalBookmark(row as RemoteBookmarkRow)))
  }
  return pushed
}

export async function syncProfile(profile: ProfileData, auth: AuthState) {
  if (!auth.userId || auth.plan === 'free') return false
  const full =
    !profile.listsCursor || !profile.bookmarksCursor || Date.now() - (profile.lastFullPullAt || 0) > 86_400_000
  const [listRows, bookmarkRows] = await Promise.all([
    fetchRows<RemoteListRow>('lists', 'id,name,json,created_at,updated_at', full ? undefined : profile.listsCursor),
    fetchRows<RemoteBookmarkRow>(
      'bookmarks',
      'id,list_id,url,title,icon,json,created_at,updated_at',
      full ? undefined : profile.bookmarksCursor,
    ),
  ])
  const remoteLists = listRows.map(toLocalList)
  const remoteBookmarks = bookmarkRows.map(toLocalBookmark)
  const pristine = isPristineStarterSeed(profile.lists, profile.bookmarks)
  if (full && remoteLists.length === 0 && remoteBookmarks.length === 0 && pristine) {
    profile.pendingListIds = profile.lists.map((row) => row.id)
    profile.pendingBookmarkIds = profile.bookmarks.map((row) => row.id)
  } else if (full && !pristine) {
    profile.pendingListIds = [
      ...new Set([...profile.pendingListIds, ...collectUnsyncedRowIds(profile.lists, remoteLists)]),
    ]
    profile.pendingBookmarkIds = [
      ...new Set([...profile.pendingBookmarkIds, ...collectUnsyncedRowIds(profile.bookmarks, remoteBookmarks)]),
    ]
  }
  profile.lists = mergeRows(profile.lists, remoteLists, profile.pendingListIds)
  profile.bookmarks = mergeRows(profile.bookmarks, remoteBookmarks, profile.pendingBookmarkIds)
  const now = Date.now()
  const retainedLists = dropExpiredSyncTombstones(profile.lists, now, new Set(profile.pendingListIds))
  const retainedBookmarks = dropExpiredSyncTombstones(profile.bookmarks, now, new Set(profile.pendingBookmarkIds))
  profile.lists = normalizeLists(retainedLists)
  profile.bookmarks = normalizeBookmarks(profile.lists, retainedBookmarks)
  const pendingLists = new Set(profile.pendingListIds)
  const pendingBookmarks = new Set(profile.pendingBookmarkIds)
  const pushedLists = await upsertLists(
    auth.userId,
    profile.lists.filter((row) => pendingLists.has(row.id)),
  )
  const pushedBookmarks = await upsertBookmarks(
    auth.userId,
    profile.bookmarks.filter((row) => pendingBookmarks.has(row.id)),
  )
  profile.lists = mergeRows(profile.lists, pushedLists, [])
  profile.bookmarks = mergeRows(profile.bookmarks, pushedBookmarks, [])
  profile.pendingListIds = profile.pendingListIds.filter((id) => !pendingLists.has(id))
  profile.pendingBookmarkIds = profile.pendingBookmarkIds.filter((id) => !pendingBookmarks.has(id))
  profile.listsCursor = nextSyncCursor(remoteLists, profile.listsCursor)
  profile.bookmarksCursor = nextSyncCursor(remoteBookmarks, profile.bookmarksCursor)
  profile.lastSyncAt = Date.now()
  if (full) {
    profile.lastFullPullAt = Date.now()
    // A full pull is when this device can tell which objects nothing points at any more.
    void removeOrphanedScreenshots(auth.userId, profile.bookmarks, screenshotStore).catch(() => {})
  }
  return true
}

export function syncProfileScreenshots(
  profile: ProfileData,
  auth: AuthState,
  fallback: Preferences['previewImageSource'],
  host: {
    isCurrent: () => boolean
    setRef: (ids: string[], ref: ScreenshotRef) => Promise<void>
    changed: (key: string) => void
  },
) {
  if (!auth.userId || auth.plan === 'free') return Promise.resolve()
  return syncScreenshots(auth.userId, profile.bookmarks, fallback, {
    ...host,
    store: screenshotStore,
    read: readPreview,
    // The pass outlives a change of account, and what it fetched is not the next account's.
    write: async (key, preview) => {
      if (host.isCurrent()) await writePreview(key, preview)
    },
    shrink: shrinkScreenshot,
    newId: () => crypto.randomUUID(),
  })
}

export function activateAccount(state: StoredState, auth: AuthState) {
  if (!auth.userId) return
  const profileId = `user:${auth.userId}`
  if (!state.profiles[profileId]) {
    const anonymous = state.profiles.anonymous || (state.profiles.anonymous = createProfile())
    const hasLocalChanges = !isPristineStarterSeed(anonymous.lists, anonymous.bookmarks)
    state.profiles[profileId] = hasLocalChanges
      ? { ...structuredClone(anonymous), ownerId: auth.userId, email: auth.email, promotedFromAnonymous: true }
      : createProfile(auth.userId, auth.email)
  }
  state.activeProfileId = profileId
}

export function finishPromotion(state: StoredState, profile: ProfileData) {
  if (!profile.promotedFromAnonymous) return
  profile.promotedFromAnonymous = false
  state.profiles.anonymous = createProfile()
}
