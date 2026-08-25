import { createClient } from '@supabase/supabase-js'
import { browser } from 'wxt/browser'
import { mergeRows, createProfile } from './domain'
import { collectUnsyncedRowIds, isPristineStarterSeed } from 'nori/lib/supabase/sync-merge'
import { supabaseStorage } from './storage'
import type { AuthState, NoriBookmark, NoriList, ProfileData, StoredState } from './model'

const SUPABASE_URL = 'https://pgukcvgypvjwtibzlvhr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xAsTNsNKJ4AFbcf0JSiKxA_2-5CDlg4'
const API_HOST = 'https://a.inks.page/api'
const AUTH_HOST = 'https://nori.inks.page/auth/extension'
const PAGE_SIZE = 1000

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: supabaseStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
const db = client.schema('nori')

export async function getAuthState(): Promise<AuthState> {
  const { data } = await client.auth.getSession()
  const session = data.session
  if (!session) return { loaded: true, plan: 'free', source: 'none' }
  try {
    const response = await fetch(`${API_HOST}/nori.me`, { headers: { authorization: session.access_token } })
    const body = await response.json()
    if (!response.ok || body?.error) throw new Error(body?.message || 'Unable to load plan')
    const entitlement = body?.result?.data || body
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

function toList(row: any): NoriList {
  return { id: row.id, name: row.name, json: row.json || {}, createdAt: row.created_at, updatedAt: row.updated_at }
}

function toBookmark(row: any): NoriBookmark {
  return {
    id: row.id,
    listId: row.list_id,
    url: row.url,
    title: row.title,
    icon: row.icon,
    json: row.json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function fetchRows(table: 'lists' | 'bookmarks', columns: string, cursor?: string) {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db
      .from(table)
      .select(columns)
      .order('updated_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (cursor) query = query.gte('updated_at', cursor)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

function nextCursor(rows: { updatedAt: string }[], previous?: string) {
  const max = rows.reduce(
    (value, row) => Math.max(value, Date.parse(row.updatedAt) || 0),
    Date.parse(previous || '') || 0,
  )
  return max ? new Date(Math.max(0, max - 30_000)).toISOString() : previous
}

async function upsertLists(userId: string, rows: NoriList[]) {
  const pushed: NoriList[] = []
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const { data, error } = await db
      .from('lists')
      .upsert(
        rows
          .slice(index, index + PAGE_SIZE)
          .map((row) => ({ user_id: userId, id: row.id, name: row.name, json: row.json })),
        { onConflict: 'user_id,id' },
      )
      .select('id,name,json,created_at,updated_at')
    if (error) throw error
    pushed.push(...(data || []).map(toList))
  }
  return pushed
}

async function upsertBookmarks(userId: string, rows: NoriBookmark[]) {
  const pushed: NoriBookmark[] = []
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const { data, error } = await db
      .from('bookmarks')
      .upsert(
        rows.slice(index, index + PAGE_SIZE).map((row) => ({
          user_id: userId,
          id: row.id,
          list_id: row.listId,
          url: row.url,
          title: row.title,
          icon: row.icon,
          json: row.json,
        })),
        { onConflict: 'user_id,id' },
      )
      .select('id,list_id,url,title,icon,json,created_at,updated_at')
    if (error) throw error
    pushed.push(...(data || []).map(toBookmark))
  }
  return pushed
}

export async function syncProfile(profile: ProfileData, auth: AuthState) {
  if (!auth.userId || auth.plan === 'free') return false
  const full =
    !profile.listsCursor || !profile.bookmarksCursor || Date.now() - (profile.lastFullPullAt || 0) > 86_400_000
  const [listRows, bookmarkRows] = await Promise.all([
    fetchRows('lists', 'id,name,json,created_at,updated_at', full ? undefined : profile.listsCursor),
    fetchRows(
      'bookmarks',
      'id,list_id,url,title,icon,json,created_at,updated_at',
      full ? undefined : profile.bookmarksCursor,
    ),
  ])
  const remoteLists = listRows.map(toList)
  const remoteBookmarks = bookmarkRows.map(toBookmark)
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
  profile.listsCursor = nextCursor(remoteLists, profile.listsCursor)
  profile.bookmarksCursor = nextCursor(remoteBookmarks, profile.bookmarksCursor)
  profile.lastSyncAt = Date.now()
  if (full) profile.lastFullPullAt = Date.now()
  return true
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
