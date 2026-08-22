import {
  createStarterBookmarks,
  createStarterLists,
  getDeletedAt,
  type BookmarkListData,
  type BookmarkRecordData,
} from '@/lib/nori-data'

export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export function parseSyncUpdatedAt(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

export function mergeSyncRows<T extends { id: string; updatedAt: string }>(
  localRows: T[],
  remoteRows: T[],
  pendingIds: Set<string>,
) {
  const byId = new Map(localRows.map((item) => [item.id, item]))
  for (const remote of remoteRows) {
    if (pendingIds.has(remote.id)) {
      continue
    }
    const local = byId.get(remote.id)
    if (!local || parseSyncUpdatedAt(remote.updatedAt) >= parseSyncUpdatedAt(local.updatedAt)) {
      byId.set(remote.id, remote)
    }
  }
  return [...byId.values()]
}

// `keepIds` holds rows whose local change has not been pushed yet. Dropping one
// of those would lose the delete: the row still exists on the server, so the
// next pull would resurrect it.
// `updated_at` comes from postgres `now()`, which is the transaction's start
// time, so a slow transaction can commit after a pull has read past it and land
// below that pull's high-water mark. Rewinding the cursor buys margin for the
// usual sub-second write; it is a heuristic, not a guarantee. What guarantees
// convergence is the periodic full pull in sync.ts — a row this window misses is
// picked up there rather than lost for good.
export const SYNC_CURSOR_OVERLAP_MS = 30_000

// Tracked per table: each one is read in its own snapshot, so a single shared
// cursor could be advanced past one table's read by the other's newer rows and
// step over whatever was committed in between.
// Never moves backwards, or the overlap would walk the cursor down a window at a
// time whenever a pull keeps returning the same boundary rows.
export function nextSyncCursor(rows: { updatedAt: string }[], previousCursor?: string) {
  const maxUpdatedAt = rows.reduce((max, row) => Math.max(max, parseSyncUpdatedAt(row.updatedAt)), 0)
  if (!maxUpdatedAt) {
    return previousCursor
  }
  const next = Math.max(maxUpdatedAt - SYNC_CURSOR_OVERLAP_MS, parseSyncUpdatedAt(previousCursor))
  return new Date(next).toISOString()
}

// Rows this device holds that the server does not have, or holds an older copy
// of. Only meaningful against a full snapshot of the remote rows — a delta says
// nothing about what the server is missing.
export function collectUnsyncedRowIds<T extends { id: string; updatedAt: string }>(
  localRows: T[],
  remoteRows: T[],
) {
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]))
  const ids: string[] = []
  for (const local of localRows) {
    const remote = remoteById.get(local.id)
    if (!remote || parseSyncUpdatedAt(local.updatedAt) > parseSyncUpdatedAt(remote.updatedAt)) {
      ids.push(local.id)
    }
  }
  return ids
}

// Which rows actually changed, so a push carries only those. Row order is not
// compared: position in the array carries no meaning, the order a list is shown
// in lives in `json.sort_index` on the rows themselves.
export function collectChangedRowIds<T extends { id: string }>(
  rows: T[] | undefined,
  previousRows: T[] | undefined,
) {
  const previousById = new Map((previousRows || []).map((item) => [item.id, JSON.stringify(item)]))
  const changed: string[] = []
  for (const row of rows || []) {
    if (previousById.get(row.id) !== JSON.stringify(row)) {
      changed.push(row.id)
    }
  }
  return changed
}

export function dropExpiredSyncTombstones<T extends { id: string; json: Record<string, unknown> }>(
  rows: T[],
  now = Date.now(),
  keepIds?: ReadonlySet<string>,
) {
  return rows.filter((row) => {
    const deletedAt = getDeletedAt(row)
    if (!deletedAt) {
      return true
    }
    if (keepIds?.has(row.id)) {
      return true
    }
    return now - parseSyncUpdatedAt(deletedAt) < TOMBSTONE_RETENTION_MS
  })
}

export function isPristineStarterSeed(
  localLists: BookmarkListData[],
  localBookmarks: BookmarkRecordData[],
) {
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
