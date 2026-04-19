import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { syncMeta$ } from '@/states/sync-meta'
import {
  createStarterBookmarks,
  createStarterLists,
  getDeletedAt,
  normalizeBookmarks,
  normalizeLists,
  type BookmarkListData,
  type BookmarkRecordData,
} from '@/lib/nori-data'
import { supabase } from './client'

type RemoteListRow = {
  id: string
  name: string
  json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type RemoteBookmarkRow = {
  id: string
  list_id: string
  url: string
  title: string
  icon: string
  json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

let watchersStarted = false
let applyingRemote = false
let syncTimer: ReturnType<typeof setTimeout> | null = null

const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

function canSync() {
  const { userId, plan } = auth$.peek()
  return Boolean(userId && plan && plan !== 'free')
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)]
}

function markAllRowsPending() {
  syncMeta$.pendingListIds.set(uniqueIds(lists$.lists.peek().map((item) => item.id)))
  syncMeta$.pendingBookmarkIds.set(uniqueIds(bookmarks$.bookmarks.peek().map((item) => item.id)))
}

function snapshotLists() {
  return normalizeLists(lists$.lists.peek())
}

function snapshotBookmarks(lists = snapshotLists()) {
  return normalizeBookmarks(lists, bookmarks$.bookmarks.peek())
}

function parseUpdatedAt(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

function mergeRows<T extends { id: string; updatedAt: string }>(localRows: T[], remoteRows: T[], pendingIds: Set<string>) {
  const byId = new Map(localRows.map((item) => [item.id, item]))
  for (const remote of remoteRows) {
    if (pendingIds.has(remote.id)) {
      continue
    }
    const local = byId.get(remote.id)
    if (!local || parseUpdatedAt(remote.updatedAt) >= parseUpdatedAt(local.updatedAt)) {
      byId.set(remote.id, remote)
    }
  }
  return [...byId.values()]
}

function dropExpiredTombstones<T extends { json: Record<string, unknown> }>(rows: T[]) {
  const now = Date.now()
  return rows.filter((row) => {
    const deletedAt = getDeletedAt(row)
    if (!deletedAt) {
      return true
    }
    return now - parseUpdatedAt(deletedAt) < TOMBSTONE_RETENTION_MS
  })
}

function isPristineStarterSeed(localLists: BookmarkListData[], localBookmarks: BookmarkRecordData[]) {
  const stripList = (item: BookmarkListData) => ({
    id: item.id,
    name: item.name,
    json: item.json,
  })
  const stripBookmark = (item: BookmarkRecordData) => ({
    id: item.id,
    listId: item.listId,
    url: item.url,
    title: item.title,
    icon: item.icon,
    json: item.json,
  })
  return (
    JSON.stringify(localLists.map(stripList)) === JSON.stringify(createStarterLists().map(stripList))
    && JSON.stringify(localBookmarks.map(stripBookmark)) === JSON.stringify(createStarterBookmarks().map(stripBookmark))
  )
}

function toLocalList(row: RemoteListRow): BookmarkListData {
  return {
    id: row.id,
    name: row.name,
    json: row.json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toLocalBookmark(row: RemoteBookmarkRow): BookmarkRecordData {
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

async function fetchRemoteRows() {
  const [{ data: listRows, error: listError }, { data: bookmarkRows, error: bookmarkError }] = await Promise.all([
    supabase.from('lists').select('id,name,json,created_at,updated_at'),
    supabase.from('bookmarks').select('id,list_id,url,title,icon,json,created_at,updated_at'),
  ])

  if (listError) {
    throw listError
  }
  if (bookmarkError) {
    throw bookmarkError
  }

  return {
    lists: (listRows || []).map((row) => toLocalList(row as RemoteListRow)),
    bookmarks: (bookmarkRows || []).map((row) => toLocalBookmark(row as RemoteBookmarkRow)),
  }
}

async function pushLists(userId: string, rows: BookmarkListData[]) {
  if (!rows.length) {
    return [] as BookmarkListData[]
  }

  const { data, error } = await supabase
    .from('lists')
    .upsert(
      rows.map((row) => ({
        user_id: userId,
        id: row.id,
        name: row.name,
        json: row.json,
      })),
      { onConflict: 'user_id,id' },
    )
    .select('id,name,json,created_at,updated_at')

  if (error) {
    throw error
  }

  return (data || []).map((row) => toLocalList(row as RemoteListRow))
}

async function pushBookmarks(userId: string, rows: BookmarkRecordData[]) {
  if (!rows.length) {
    return [] as BookmarkRecordData[]
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .upsert(
      rows.map((row) => ({
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

  if (error) {
    throw error
  }

  return (data || []).map((row) => toLocalBookmark(row as RemoteBookmarkRow))
}

function applyRemoteState(nextLists: BookmarkListData[], nextBookmarks: BookmarkRecordData[]) {
  applyingRemote = true
  try {
    const normalizedLists = normalizeLists(dropExpiredTombstones(nextLists))
    const normalizedBookmarks = normalizeBookmarks(normalizedLists, dropExpiredTombstones(nextBookmarks))
    lists$.lists.set(normalizedLists)
    bookmarks$.bookmarks.set(normalizedBookmarks)
  } finally {
    applyingRemote = false
  }
}

export function scheduleSync(delayMs = 1000) {
  if (!canSync()) {
    return
  }
  if (syncTimer) {
    clearTimeout(syncTimer)
  }
  syncTimer = setTimeout(() => {
    syncTimer = null
    void syncSupabase()
  }, delayMs)
}

export function startSupabaseSyncWatchers() {
  if (watchersStarted) {
    return
  }
  watchersStarted = true

  lists$.lists.onChange(({ value, getPrevious }) => {
    if (applyingRemote) {
      return
    }
    const previous = getPrevious()
    if (!previous) {
      return
    }
    if (JSON.stringify(value) !== JSON.stringify(previous)) {
      syncMeta$.pendingListIds.set(uniqueIds((value || []).map((item: BookmarkListData) => item.id)))
      scheduleSync()
    }
  })

  bookmarks$.bookmarks.onChange(({ value, getPrevious }) => {
    if (applyingRemote) {
      return
    }
    const previous = getPrevious()
    if (!previous) {
      return
    }
    if (JSON.stringify(value) !== JSON.stringify(previous)) {
      syncMeta$.pendingBookmarkIds.set(uniqueIds((value || []).map((item: BookmarkRecordData) => item.id)))
      scheduleSync()
    }
  })
}

export async function syncSupabase() {
  if (!canSync() || syncMeta$.inFlight.peek()) {
    return
  }

  const userId = auth$.userId.peek()
  if (!userId) {
    return
  }

  syncMeta$.assign({
    inFlight: true,
    lastError: undefined,
  })

  try {
    const localLists = snapshotLists()
    const localBookmarks = snapshotBookmarks(localLists)
    const pendingListIds = new Set(syncMeta$.pendingListIds.peek())
    const pendingBookmarkIds = new Set(syncMeta$.pendingBookmarkIds.peek())
    const remote = await fetchRemoteRows()
    const remoteLists = normalizeLists(remote.lists)
    const remoteBookmarks = normalizeBookmarks(remoteLists, remote.bookmarks)

    const shouldSeedRemote =
      !syncMeta$.lastSyncAt.peek() &&
      pendingListIds.size === 0 &&
      pendingBookmarkIds.size === 0 &&
      remoteLists.length === 0 &&
      remoteBookmarks.length === 0 &&
      isPristineStarterSeed(localLists, localBookmarks)

    if (shouldSeedRemote) {
      markAllRowsPending()
    }

    const nextPendingListIds = new Set(syncMeta$.pendingListIds.peek())
    const nextPendingBookmarkIds = new Set(syncMeta$.pendingBookmarkIds.peek())

    let mergedLists = mergeRows(localLists, remoteLists, nextPendingListIds)
    let mergedBookmarks = mergeRows(localBookmarks, remoteBookmarks, nextPendingBookmarkIds)
    applyRemoteState(mergedLists, mergedBookmarks)

    const pushedLists = await pushLists(userId, snapshotLists().filter((item) => nextPendingListIds.has(item.id)))
    if (pushedLists.length) {
      mergedLists = mergeRows(snapshotLists(), pushedLists, new Set())
      syncMeta$.pendingListIds.set(syncMeta$.pendingListIds.peek().filter((id) => !nextPendingListIds.has(id)))
      applyRemoteState(mergedLists, snapshotBookmarks(mergedLists))
    }

    const pushedBookmarks = await pushBookmarks(userId, snapshotBookmarks(snapshotLists()).filter((item) => nextPendingBookmarkIds.has(item.id)))
    if (pushedBookmarks.length) {
      mergedBookmarks = mergeRows(snapshotBookmarks(snapshotLists()), pushedBookmarks, new Set())
      syncMeta$.pendingBookmarkIds.set(syncMeta$.pendingBookmarkIds.peek().filter((id) => !nextPendingBookmarkIds.has(id)))
      applyRemoteState(snapshotLists(), mergedBookmarks)
    }

    syncMeta$.assign({
      inFlight: false,
      lastSyncAt: Date.now(),
      lastError: undefined,
    })
  } catch (error) {
    syncMeta$.assign({
      inFlight: false,
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
