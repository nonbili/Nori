import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { syncMeta$ } from '@/states/sync-meta'
import { dropExpiredSyncTombstones } from '@/lib/supabase/sync-merge'

// Soft-deleted rows are kept so a delete can still be pushed to other devices,
// but nothing removed them locally unless a sync cycle ran. Offline and free
// accounts never reach that path, so their tombstones accumulate forever and are
// re-parsed and re-serialized on every mutation. Run at startup for everyone.
//
// Rows still listed as pending are never dropped — see dropExpiredSyncTombstones.
export function purgeExpiredTombstones(now = Date.now()) {
  const lists = lists$.lists.peek()
  const bookmarks = bookmarks$.bookmarks.peek()
  const nextLists = dropExpiredSyncTombstones(lists, now, new Set(syncMeta$.pendingListIds.peek()))
  const nextBookmarks = dropExpiredSyncTombstones(bookmarks, now, new Set(syncMeta$.pendingBookmarkIds.peek()))

  // Only write when something actually expired, so a normal launch does not
  // rewrite both stores for nothing.
  if (nextLists.length !== lists.length) {
    lists$.lists.set(nextLists)
  }
  if (nextBookmarks.length !== bookmarks.length) {
    bookmarks$.bookmarks.set(nextBookmarks)
  }

  return {
    lists: lists.length - nextLists.length,
    bookmarks: bookmarks.length - nextBookmarks.length,
  }
}
