import {
  createStarterBookmarks,
  createStarterLists,
  getDeletedAt,
  type BookmarkListData,
  type BookmarkRecordData,
} from '@/lib/nori-data'

const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

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

export function dropExpiredSyncTombstones<T extends { json: Record<string, unknown> }>(
  rows: T[],
  now = Date.now(),
) {
  return rows.filter((row) => {
    const deletedAt = getDeletedAt(row)
    if (!deletedAt) {
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
