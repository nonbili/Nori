import { batch } from '@legendapp/state'
import { useEffect, useRef } from 'react'
import { auth$ } from 'nori-root/states/auth'
import { bookmarks$ } from 'nori-root/states/bookmarks'
import { history$ } from 'nori-root/states/history'
import { lists$ } from 'nori-root/states/lists'
import { settings$ } from 'nori-root/states/settings'
import { syncMeta$ } from 'nori-root/states/sync-meta'
import { request } from '../lib/client'
import type { AppSnapshot, HistoryItem, Preferences } from '../lib/model'

const toHistoryItem = (item: (typeof history$.openedBookmarks)['get'] extends () => (infer T)[] ? T : never): HistoryItem => ({
  ...item,
  openedAt: new Date(item.openedAt).toISOString(),
})

function currentPayload() {
  const preferences: Preferences = {
    theme: settings$.theme.peek() ?? 'system',
    language: settings$.language.peek(),
    lastListId: settings$.lastSelectedListId.peek(),
    showFavicons: settings$.showFavicon.peek(),
  }
  return {
    lists: lists$.lists.peek(),
    bookmarks: bookmarks$.bookmarks.peek(),
    history: history$.openedBookmarks.peek().map(toHistoryItem),
    preferences,
  }
}

const fingerprint = (value: ReturnType<typeof currentPayload>) => JSON.stringify(value)

/**
 * Mutable state of the local write pipeline, shared between the projection and
 * commit effects. `flushing` only guards flush() re-entrancy, so it is not part
 * of the pending check: the trailing refresh() inside a flush must be allowed
 * to project. Deriving "pending" from real state rather than a manual flag
 * means a failed write cannot wedge the projection permanently.
 */
interface WriteState {
  timer?: ReturnType<typeof setTimeout>
  flushing: boolean
  inFlight: boolean
  queuedPayload?: ReturnType<typeof currentPayload>
}

const isWritePending = (state: WriteState) =>
  state.timer !== undefined || state.inFlight || state.queuedPayload !== undefined

/**
 * Keeps the shared synchronous UI stores as a projection of the extension's
 * durable background state. UI edits are batched and committed atomically so a
 * closing popup cannot leave only half of a multi-store operation persisted.
 */
export function useSharedStateBridge(snapshot: AppSnapshot, refresh: () => Promise<void>, setError: (message: string) => void) {
  const applyingSnapshot = useRef(false)
  const lastFingerprint = useRef('')
  const missedSnapshot = useRef(false)
  const write = useRef<WriteState>({ flushing: false, inFlight: false })

  useEffect(() => {
    // A background snapshot can arrive while a local edit is still debouncing or
    // in flight, before replace-data has entered the operation queue. Preserve
    // the local stores until that write settles, then re-read once it has.
    if (isWritePending(write.current)) {
      missedSnapshot.current = true
      return
    }
    missedSnapshot.current = false
    applyingSnapshot.current = true
    batch(() => {
      lists$.lists.set(snapshot.profile.lists)
      bookmarks$.bookmarks.set(snapshot.profile.bookmarks)
      history$.openedBookmarks.set(
        snapshot.profile.history.map((item) => ({ ...item, openedAt: Date.parse(item.openedAt) || Date.now() })),
      )
      settings$.theme.set(snapshot.preferences.theme === 'system' ? null : snapshot.preferences.theme)
      settings$.language.set(snapshot.preferences.language as any)
      settings$.lastSelectedListId.set(snapshot.preferences.lastListId)
      settings$.showFavicon.set(snapshot.preferences.showFavicons)
      auth$.assign({
        loaded: snapshot.auth.loaded,
        userId: snapshot.auth.userId,
        userEmail: snapshot.auth.email,
        plan: snapshot.auth.plan,
        source: snapshot.auth.source,
      })
      syncMeta$.assign({
        inFlight: snapshot.syncing,
        lastError: snapshot.syncError,
        lastSyncAt: snapshot.profile.lastSyncAt,
      })
    })
    lastFingerprint.current = fingerprint(currentPayload())
    queueMicrotask(() => {
      applyingSnapshot.current = false
    })
  }, [snapshot])

  useEffect(() => {
    const state = write.current
    let stopped = false
    // Re-read once a local write settles if snapshots were dropped meanwhile.
    const settle = () => {
      if (stopped || isWritePending(state) || !missedSnapshot.current) return
      missedSnapshot.current = false
      void refresh()
    }
    const flush = async () => {
      if (state.flushing || !state.queuedPayload) return
      state.flushing = true
      try {
        while (state.queuedPayload) {
          const payload = state.queuedPayload
          state.queuedPayload = undefined
          state.inFlight = true
          try {
            await request({ type: 'replace-data', ...payload })
          } finally {
            state.inFlight = false
          }
        }
        if (!stopped) {
          missedSnapshot.current = false
          await refresh()
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        state.flushing = false
        if (state.queuedPayload) void flush()
        else settle()
      }
    }
    const commit = () => {
      if (applyingSnapshot.current) return
      clearTimeout(state.timer)
      state.timer = setTimeout(() => {
        state.timer = undefined
        const payload = currentPayload()
        const nextFingerprint = fingerprint(payload)
        if (nextFingerprint === lastFingerprint.current) {
          settle()
          return
        }
        lastFingerprint.current = nextFingerprint
        state.queuedPayload = payload
        void flush()
      }, 40)
    }

    const subscriptions = [
      lists$.lists.onChange(commit),
      bookmarks$.bookmarks.onChange(commit),
      history$.openedBookmarks.onChange(commit),
      settings$.theme.onChange(commit),
      settings$.language.onChange(commit),
      settings$.lastSelectedListId.onChange(commit),
      settings$.showFavicon.onChange(commit),
    ]
    return () => {
      stopped = true
      clearTimeout(state.timer)
      state.timer = undefined
      subscriptions.forEach((subscription) => subscription())
    }
  }, [refresh, setError])
}
