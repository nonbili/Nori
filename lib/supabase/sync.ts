import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { syncMeta$ } from '@/states/sync-meta'
import {
  normalizeBookmarks,
  normalizeLists,
  type BookmarkListData,
  type BookmarkRecordData,
} from '@/lib/nori-data'
import { dropExpiredSyncTombstones, isPristineStarterSeed, mergeSyncRows } from '@/lib/supabase/sync-merge'
import { runWithConflictRetry, type SyncAttemptOutcome } from '@/lib/supabase/sync-scheduler'
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
let syncDeadline = 0
let explicitDeadline = 0
let activeSync: Promise<SyncAttemptOutcome> | null = null
let localRevision = 0
let syncQueued = false
type SyncWaiter = { resolve: () => void; reject: (error: unknown) => void; carryovers: number }
let queuedWaiters: SyncWaiter[] = []

// A conflicted cycle pushed nothing, so callers awaiting it are chained onto the
// follow-up instead of being told it succeeded. Counted per waiter so a caller
// that just arrived does not inherit an older one's budget, and bounded so a
// user who keeps editing cannot keep a manual sync spinning forever.
const MAX_WAITER_CARRYOVERS = 3

// Thrown at waiters whose changes are still unpushed after that many conflicted
// cycles. Callers translate it; nothing was lost, the follow-up still runs.
export const SYNC_PENDING_ERROR = 'sync-pending-changes'

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
    const normalizedLists = normalizeLists(dropExpiredSyncTombstones(nextLists))
    const normalizedBookmarks = normalizeBookmarks(normalizedLists, dropExpiredSyncTombstones(nextBookmarks))
    lists$.lists.set(normalizedLists)
    bookmarks$.bookmarks.set(normalizedBookmarks)
  } finally {
    applyingRemote = false
  }
}

// Background edits debounce as usual, so a burst of changes still settles before
// a sync starts. An explicit request only ever brings the run forward, and caps
// how far a later edit may push it back — otherwise a stream of edits could
// postpone a manual sync by another second, indefinitely.
function armSyncTimer(delayMs: number, explicit: boolean) {
  const now = Date.now()
  let deadline = now + delayMs

  if (explicit) {
    explicitDeadline = explicitDeadline ? Math.min(explicitDeadline, deadline) : deadline
    deadline = explicitDeadline
    if (syncTimer && syncDeadline <= deadline) {
      return
    }
  } else {
    if (explicitDeadline) {
      deadline = Math.min(deadline, explicitDeadline)
    }
    if (syncTimer && syncDeadline === deadline) {
      return
    }
  }

  if (syncTimer) {
    clearTimeout(syncTimer)
  }
  syncDeadline = deadline
  syncTimer = setTimeout(executeScheduledSync, Math.max(0, deadline - now))
}

function executeScheduledSync() {
  syncTimer = null
  explicitDeadline = 0
  if (activeSync) {
    return
  }
  if (!syncQueued) {
    return
  }

  syncQueued = false
  const waiters = queuedWaiters
  queuedWaiters = []
  activeSync = runSyncCycle()
  void activeSync.then((outcome) => {
    if (outcome !== 'conflict') {
      for (const waiter of waiters) {
        waiter.resolve()
      }
      return
    }
    for (const waiter of waiters) {
      if (waiter.carryovers < MAX_WAITER_CARRYOVERS) {
        queuedWaiters.push({ ...waiter, carryovers: waiter.carryovers + 1 })
      } else {
        waiter.reject(new Error(SYNC_PENDING_ERROR))
      }
    }
  }).catch((error) => {
    for (const waiter of waiters) {
      waiter.reject(error)
    }
  }).finally(() => {
    activeSync = null
    if (syncQueued && !syncTimer) {
      // Carried-over waiters are still an explicit request, so edits must not
      // keep sliding the follow-up they are chained to.
      armSyncTimer(1000, queuedWaiters.length > 0)
    }
  })
}

function queueSync(delayMs: number, waitForCompletion: boolean, explicit: boolean) {
  if (!canSync()) {
    return Promise.resolve()
  }
  syncQueued = true
  const completion = waitForCompletion
    ? new Promise<void>((resolve, reject) => queuedWaiters.push({ resolve, reject, carryovers: 0 }))
    : Promise.resolve()
  armSyncTimer(delayMs, explicit)
  return completion
}

export function scheduleSync(delayMs = 1000) {
  void queueSync(delayMs, false, false)
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
      localRevision += 1
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
      localRevision += 1
      syncMeta$.pendingBookmarkIds.set(uniqueIds((value || []).map((item: BookmarkRecordData) => item.id)))
      scheduleSync()
    }
  })
}

async function runSupabaseSync(): Promise<SyncAttemptOutcome> {
  if (!canSync()) {
    return 'skipped'
  }

  const userId = auth$.userId.peek()
  if (!userId) {
    return 'skipped'
  }

  const fetchRevision = localRevision
  const localLists = snapshotLists()
  const localBookmarks = snapshotBookmarks(localLists)
  const pendingListIds = new Set(syncMeta$.pendingListIds.peek())
  const pendingBookmarkIds = new Set(syncMeta$.pendingBookmarkIds.peek())
  const remote = await fetchRemoteRows()
  if (localRevision !== fetchRevision) {
    return 'conflict'
  }
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

  let mergedLists = mergeSyncRows(localLists, remoteLists, nextPendingListIds)
  let mergedBookmarks = mergeSyncRows(localBookmarks, remoteBookmarks, nextPendingBookmarkIds)
  applyRemoteState(mergedLists, mergedBookmarks)

  const listPushRevision = localRevision
  const pushedLists = await pushLists(userId, snapshotLists().filter((item) => nextPendingListIds.has(item.id)))
  if (localRevision !== listPushRevision) {
    return 'conflict'
  }
  if (pushedLists.length) {
    mergedLists = mergeSyncRows(snapshotLists(), pushedLists, new Set())
    syncMeta$.pendingListIds.set(syncMeta$.pendingListIds.peek().filter((id) => !nextPendingListIds.has(id)))
    applyRemoteState(mergedLists, snapshotBookmarks(mergedLists))
  }

  const bookmarkPushRevision = localRevision
  const pushedBookmarks = await pushBookmarks(userId, snapshotBookmarks(snapshotLists()).filter((item) => nextPendingBookmarkIds.has(item.id)))
  if (localRevision !== bookmarkPushRevision) {
    return 'conflict'
  }
  if (pushedBookmarks.length) {
    mergedBookmarks = mergeSyncRows(snapshotBookmarks(snapshotLists()), pushedBookmarks, new Set())
    syncMeta$.pendingBookmarkIds.set(syncMeta$.pendingBookmarkIds.peek().filter((id) => !nextPendingBookmarkIds.has(id)))
    applyRemoteState(snapshotLists(), mergedBookmarks)
  }

  return 'synced'
}

async function runSyncCycle(): Promise<SyncAttemptOutcome> {
  syncMeta$.assign({
    inFlight: true,
    lastError: undefined,
  })

  try {
    const outcome = await runWithConflictRetry(
      runSupabaseSync,
      () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    )
    if (outcome === 'conflict') {
      syncQueued = true
    } else if (outcome === 'synced') {
      // A skipped cycle never talked to the server, so stamping lastSyncAt here
      // would permanently disable the first-run remote seeding below.
      syncMeta$.lastSyncAt.set(Date.now())
    }
    return outcome
  } catch (error) {
    syncMeta$.lastError.set(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    syncMeta$.inFlight.set(false)
  }
}

export function syncSupabase() {
  return queueSync(activeSync ? 1000 : 0, true, true)
}
