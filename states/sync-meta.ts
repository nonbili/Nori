import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { Platform } from 'react-native'

interface Store {
  inFlight: boolean
  lastSyncAt?: number
  lastError?: string
  pendingListIds: string[]
  pendingBookmarkIds: string[]
  // Highest `updated_at` seen from each table, as the start of that table's next
  // incremental pull. Scoped to the account they were read from.
  syncUserId?: string
  syncListsCursor?: string
  syncBookmarksCursor?: string
  lastFullPullAt?: number
}

export const syncMeta$ = observable<Store>({
  inFlight: false,
  lastSyncAt: undefined,
  lastError: undefined,
  pendingListIds: [],
  pendingBookmarkIds: [],
  syncUserId: undefined,
  syncListsCursor: undefined,
  syncBookmarksCursor: undefined,
  lastFullPullAt: undefined,
})

if (Platform.OS !== 'web') {
  syncObservable(syncMeta$, {
    persist: {
      name: 'sync-meta',
      plugin: ObservablePersistMMKV,
    },
  })
}
