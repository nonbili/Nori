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
import {
  collectChangedRowIds,
  dropExpiredSyncTombstones,
  isPristineStarterSeed,
  collectUnsyncedRowIds,
  mergeSyncRows,
  nextSyncCursor,
} from '@/lib/supabase/sync-merge'
import { collectPagedRows, keysetFilter, SYNC_PAGE_SIZE } from '@/lib/supabase/sync-paging'
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

// How long incremental pulls may run before one full reconciliation. Cheap at
// this data size, and it bounds how long a row the cursor skipped can stay
// missing to one interval rather than forever.
const FULL_PULL_INTERVAL_MS = 24 * 60 * 60 * 1000

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

// Rows only ever leave the store locally by being compacted away (an expired
// tombstone, a row orphaned by normalization). There is nothing to push for
// those, but they still count as a local change so an in-flight cycle does not
// merge a remote snapshot taken before them.
function hasLocalChange(changedIds: string[], rows: unknown[] | undefined, previousRows: unknown[]) {
  return changedIds.length > 0 || (rows?.length ?? 0) !== previousRows.length
}

// Pending ids accumulate until a push clears exactly the ids it sent, so an edit
// made while an earlier push is in flight is not forgotten.
function addPendingIds(pending$: typeof syncMeta$.pendingListIds, ids: string[]) {
  if (!ids.length) {
    return
  }
  pending$.set(uniqueIds([...pending$.peek(), ...ids]))
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

async function fetchAllRows<T extends { id: string; updated_at: string }>(
  table: 'lists' | 'bookmarks',
  columns: string,
  cursor?: string,
) {
  return collectPagedRows<T>(async (keyset) => {
    let query = supabase
      .from(table)
      .select(columns)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(SYNC_PAGE_SIZE)

    if (keyset) {
      query = query.or(keysetFilter(keyset))
    } else if (cursor) {
      query = query.gt('updated_at', cursor)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }
    return (data || []) as unknown as T[]
  })
}

// Every page of both tables, or it throws. Reconciling against a truncated
// snapshot would read the rows that did not fit as missing from the server.
async function fetchRemoteRows(listCursor?: string, bookmarkCursor?: string) {
  const [listRows, bookmarkRows] = await Promise.all([
    fetchAllRows<RemoteListRow>('lists', 'id,name,json,created_at,updated_at', listCursor),
    fetchAllRows<RemoteBookmarkRow>('bookmarks', 'id,list_id,url,title,icon,json,created_at,updated_at', bookmarkCursor),
  ])

  return {
    lists: listRows.map(toLocalList),
    bookmarks: bookmarkRows.map(toLocalBookmark),
  }
}

// Only pulled rows move the cursor. Rows this device just pushed carry a server
// timestamp too, but counting them could step the cursor past another device's
// write that committed while the push was in flight; letting them come back on
// the next pull costs one extra row each and cannot lose anything.
function advanceSyncCursor(
  userId: string,
  pulled: { lists: { updatedAt: string }[]; bookmarks: { updatedAt: string }[] },
  wasFullPull: boolean,
) {
  syncMeta$.syncUserId.set(userId)
  syncMeta$.syncListsCursor.set(nextSyncCursor(pulled.lists, syncMeta$.syncListsCursor.peek()))
  syncMeta$.syncBookmarksCursor.set(nextSyncCursor(pulled.bookmarks, syncMeta$.syncBookmarksCursor.peek()))
  if (wasFullPull) {
    syncMeta$.lastFullPullAt.set(Date.now())
  }
}

// Batched for the same reason reads are paged: an upsert echoes the rows back
// through `select`, and anything past `max_rows` would be dropped from the
// response, leaving this device without the server timestamps it just wrote.
function toBatches<T>(rows: T[], size = SYNC_PAGE_SIZE) {
  const batches: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size))
  }
  return batches
}

async function pushLists(userId: string, rows: BookmarkListData[]) {
  const pushed: BookmarkListData[] = []

  for (const batch of toBatches(rows)) {
    const { data, error } = await supabase
      .from('lists')
      .upsert(
        batch.map((row) => ({
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

    pushed.push(...(data || []).map((row) => toLocalList(row as RemoteListRow)))
  }

  return pushed
}

async function pushBookmarks(userId: string, rows: BookmarkRecordData[]) {
  const pushed: BookmarkRecordData[] = []

  for (const batch of toBatches(rows)) {
    const { data, error } = await supabase
      .from('bookmarks')
      .upsert(
        batch.map((row) => ({
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

    pushed.push(...(data || []).map((row) => toLocalBookmark(row as RemoteBookmarkRow)))
  }

  return pushed
}

function applyRemoteState(nextLists: BookmarkListData[], nextBookmarks: BookmarkRecordData[]) {
  applyingRemote = true
  try {
    const now = Date.now()
    const pendingListIds = new Set(syncMeta$.pendingListIds.peek())
    const pendingBookmarkIds = new Set(syncMeta$.pendingBookmarkIds.peek())
    const normalizedLists = normalizeLists(dropExpiredSyncTombstones(nextLists, now, pendingListIds))
    const normalizedBookmarks = normalizeBookmarks(
      normalizedLists,
      dropExpiredSyncTombstones(nextBookmarks, now, pendingBookmarkIds),
    )
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
    const changedIds = collectChangedRowIds<BookmarkListData>(value, previous)
    if (!hasLocalChange(changedIds, value, previous)) {
      return
    }
    localRevision += 1
    addPendingIds(syncMeta$.pendingListIds, changedIds)
    scheduleSync()
  })

  bookmarks$.bookmarks.onChange(({ value, getPrevious }) => {
    if (applyingRemote) {
      return
    }
    const previous = getPrevious()
    if (!previous) {
      return
    }
    const changedIds = collectChangedRowIds<BookmarkRecordData>(value, previous)
    if (!hasLocalChange(changedIds, value, previous)) {
      return
    }
    localRevision += 1
    addPendingIds(syncMeta$.pendingBookmarkIds, changedIds)
    scheduleSync()
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
  // A cursor is only meaningful for the account it was read from. Beyond that,
  // reconcile in full on a schedule: the cursor's overlap window cannot prove it
  // never skipped a row, so a full pull is what actually makes the two sides
  // converge again.
  const isSameAccount = syncMeta$.syncUserId.peek() === userId
  const listCursor = isSameAccount ? syncMeta$.syncListsCursor.peek() : undefined
  const bookmarkCursor = isSameAccount ? syncMeta$.syncBookmarksCursor.peek() : undefined
  const lastFullPullAt = syncMeta$.lastFullPullAt.peek() || 0
  const isFullPull = !listCursor || !bookmarkCursor || Date.now() - lastFullPullAt >= FULL_PULL_INTERVAL_MS
  const remote = isFullPull ? await fetchRemoteRows() : await fetchRemoteRows(listCursor, bookmarkCursor)
  if (localRevision !== fetchRevision) {
    return 'conflict'
  }
  // Remote rows are merged as they arrive and the union is normalized in
  // applyRemoteState. Normalizing a delta on its own would corrupt it:
  // normalizeLists re-adds every absent starter row with a fresh timestamp, and
  // normalizeBookmarks drops bookmarks whose list is not in the same batch.
  const remoteLists = remote.lists
  const remoteBookmarks = remote.bookmarks

  const isPristine = isPristineStarterSeed(localLists, localBookmarks)

  const shouldSeedRemote =
    isFullPull &&
    pendingListIds.size === 0 &&
    pendingBookmarkIds.size === 0 &&
    remoteLists.length === 0 &&
    remoteBookmarks.length === 0 &&
    isPristine

  if (shouldSeedRemote) {
    markAllRowsPending()
  } else if (isFullPull && !isPristine) {
    // Pushing only changed rows means a row that never reached the server is no
    // longer repaired by the next unrelated edit, so a full pull also repairs:
    // rows the server is missing, or holds an older copy of, are queued.
    //
    // Only those. Marking every row pending would make this device authoritative
    // for all of them and push its copies over whatever another device wrote
    // since — rows the server holds a newer version of stay with the normal
    // timestamp resolution below.
    addPendingIds(syncMeta$.pendingListIds, collectUnsyncedRowIds(localLists, remoteLists))
    addPendingIds(syncMeta$.pendingBookmarkIds, collectUnsyncedRowIds(localBookmarks, remoteBookmarks))
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

  advanceSyncCursor(userId, remote, isFullPull)
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
