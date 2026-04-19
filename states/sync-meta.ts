import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

interface Store {
  inFlight: boolean
  lastSyncAt?: number
  lastError?: string
  pendingListIds: string[]
  pendingBookmarkIds: string[]
}

export const syncMeta$ = observable<Store>({
  inFlight: false,
  lastSyncAt: undefined,
  lastError: undefined,
  pendingListIds: [],
  pendingBookmarkIds: [],
})

syncObservable(syncMeta$, {
  persist: {
    name: 'sync-meta',
    plugin: ObservablePersistMMKV,
  },
})
