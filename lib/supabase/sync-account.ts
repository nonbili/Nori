import { exportBookmarksToJson } from '@/lib/bookmark-transfer'
import { createStarterBookmarks, createStarterLists } from '@/lib/nori-data'
import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { syncOwner$ } from '@/states/sync-owner'
import { applyAccountData, fetchRemoteRows, syncSupabase } from './sync'
import { mergeDeviceIntoAccount } from './sync-merge'
import {
  bumpSyncGeneration,
  getSyncGeneration,
  getSyncOwner,
  hasSyncPlan,
  needsAccountChoice,
  setSwitchingAccount,
} from './sync-session'

/**
 * What to do with the data on this device when it belongs to another account:
 * - useAccount: put the signed-in account's data in its place.
 * - mergeDevice: add it to the signed-in account; what the account has of the same thing stays.
 */
export type AccountChoice = 'useAccount' | 'mergeDevice'

/** Gives the data on this device to the signed-in account, as the user chose. */
export async function resolveAccountChoice(choice: AccountChoice) {
  const userId = auth$.userId.peek()
  if (!userId || !hasSyncPlan() || !needsAccountChoice()) return

  // Nothing else syncs while the data changes hands.
  setSwitchingAccount(true)
  bumpSyncGeneration()
  // Any change of account meanwhile, even one that came back to this account, makes what was
  // read a mix of accounts: none of it is used.
  const started = getSyncGeneration()
  try {
    const fromUserId = getSyncOwner()
    const remote = await fetchRemoteRows(() => {})
    if (getSyncGeneration() !== started || auth$.userId.peek() !== userId) return

    // Taken right before the data changes hands, so it has what was changed here while reading.
    const lists = lists$.lists.peek()
    const bookmarks = bookmarks$.bookmarks.peek()
    syncOwner$.switchBackup.set({ fromUserId, savedAt: Date.now(), json: exportBookmarksToJson(lists, bookmarks) })

    if (choice === 'useAccount') {
      const empty = !remote.lists.length && !remote.bookmarks.length
      applyAccountData(
        empty ? createStarterLists() : remote.lists,
        empty ? createStarterBookmarks() : remote.bookmarks,
        [],
        [],
      )
    } else {
      const merged = mergeDeviceIntoAccount(lists, bookmarks, remote.lists, remote.bookmarks)
      applyAccountData(merged.lists, merged.bookmarks, merged.pendingListIds, merged.pendingBookmarkIds)
    }
    syncOwner$.ownerUserId.set(userId)
  } finally {
    setSwitchingAccount(false)
    bumpSyncGeneration()
  }
  await syncSupabase()
}
