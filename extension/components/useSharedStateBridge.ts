import { batch } from '@legendapp/state'
import { updatePreviewBookmarks } from 'nori-root/lib/bookmark-preview'
import { useEffect, useRef } from 'react'
import { auth$ } from 'nori-root/states/auth'
import { bookmarks$ } from 'nori-root/states/bookmarks'
import { history$ } from 'nori-root/states/history'
import { lists$ } from 'nori-root/states/lists'
import { settings$ } from 'nori-root/states/settings'
import { syncMeta$ } from 'nori-root/states/sync-meta'
import { normalizeAccent } from 'nori-root/lib/accent'
import { normalizeFontScale, normalizeFontFamily } from 'nori-root/lib/typography'
import { request } from '../lib/client'
import type { AppSnapshot, HistoryItem, Preferences } from '../lib/model'

const toHistoryItem = (item: (typeof history$.openedBookmarks)['get'] extends () => (infer T)[] ? T : never): HistoryItem => ({
  ...item,
  openedAt: new Date(item.openedAt).toISOString(),
})

/**
 * How each stored preference maps onto the shared settings store. The mapped
 * type makes this the one list to extend: a key added to Preferences without an
 * entry here does not compile, and reading, projecting and watching all derive
 * from it.
 */
type PreferenceBridge = {
  [K in keyof Preferences]: {
    setting$: { onChange: (callback: () => void) => () => void }
    read: () => Preferences[K]
    write: (value: Preferences[K]) => void
  }
}

const preferenceBridge: PreferenceBridge = {
  theme: {
    setting$: settings$.theme,
    read: () => settings$.theme.peek() ?? 'system',
    write: (value) => settings$.theme.set(value === 'system' ? null : value),
  },
  fontScale: {
    setting$: settings$.fontScale,
    read: () => normalizeFontScale(settings$.fontScale.peek()),
    write: (value) => settings$.fontScale.set(normalizeFontScale(value)),
  },
  fontFamily: {
    setting$: settings$.fontFamily,
    read: () => normalizeFontFamily(settings$.fontFamily.peek()),
    write: (value) => settings$.fontFamily.set(normalizeFontFamily(value)),
  },
  accent: {
    setting$: settings$.accent,
    read: () => normalizeAccent(settings$.accent.peek()),
    write: (value) => settings$.accent.set(normalizeAccent(value)),
  },
  language: {
    setting$: settings$.language,
    read: () => settings$.language.peek(),
    write: (value) => settings$.language.set(value as any),
  },
  lastListId: {
    setting$: settings$.lastSelectedListId,
    read: () => settings$.lastSelectedListId.peek(),
    write: (value) => settings$.lastSelectedListId.set(value),
  },
  bookmarkView: {
    setting$: settings$.bookmarkView,
    read: () => settings$.bookmarkView.peek(),
    write: (value) => settings$.bookmarkView.set(value ?? 'compact'),
  },
  previewImageSource: {
    setting$: settings$.previewImageSource,
    read: () => settings$.previewImageSource.peek(),
    write: (value) => settings$.previewImageSource.set(value ?? 'page-image'),
  },
  showFavicons: {
    setting$: settings$.showFavicon,
    read: () => settings$.showFavicon.peek(),
    write: (value) => settings$.showFavicon.set(value),
  },
  newBookmarksAtTop: {
    setting$: settings$.newBookmarksAtTop,
    read: () => settings$.newBookmarksAtTop.peek(),
    write: (value) => settings$.newBookmarksAtTop.set(value !== false),
  },
  loadPagesForTitles: {
    setting$: settings$.loadPagesForTitles,
    read: () => settings$.loadPagesForTitles.peek(),
    write: (value) => settings$.loadPagesForTitles.set(value === true),
  },
  autoCheckUpdates: {
    setting$: settings$.checkForUpdatesOnStartup,
    read: () => settings$.checkForUpdatesOnStartup.peek(),
    write: (value) => settings$.checkForUpdatesOnStartup.set(value !== false),
  },
  closeToTray: {
    setting$: settings$.closeToTray,
    read: () => settings$.closeToTray.peek(),
    write: (value) => settings$.closeToTray.set(value !== false),
  },
}

const preferenceKeys = Object.keys(preferenceBridge) as (keyof Preferences)[]

function currentPayload() {
  const preferences = Object.fromEntries(
    preferenceKeys.map((key) => [key, preferenceBridge[key].read()]),
  ) as unknown as Preferences
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
    const prune = () => {
      const urls = bookmarks$.bookmarks.peek().map((row) => row.url)
      const durableUrls = snapshot.profile.bookmarks.map((row) => row.url)
      void updatePreviewBookmarks([...urls, ...durableUrls, ...(snapshot.otherProfilePreviewUrls || [])]).catch(() => {})
    }
    // The projection effect below installs the initial snapshot before this
    // deferred pass runs. Subsequent local edits and sync replacements prune too.
    const timer = setTimeout(prune, 0)
    const unsubscribe = bookmarks$.bookmarks.onChange(prune)
    return () => { clearTimeout(timer); unsubscribe() }
  }, [snapshot.otherProfilePreviewUrls, snapshot.profileId, snapshot.profile.bookmarks])

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
      for (const key of preferenceKeys) {
        const write = preferenceBridge[key].write as (value: Preferences[typeof key]) => void
        write(snapshot.preferences[key])
      }
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
      ...preferenceKeys.map((key) => preferenceBridge[key].setting$.onChange(commit)),
    ]
    return () => {
      stopped = true
      clearTimeout(state.timer)
      state.timer = undefined
      subscriptions.forEach((subscription) => subscription())
    }
  }, [refresh, setError])
}
