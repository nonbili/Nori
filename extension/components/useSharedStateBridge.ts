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
 * Keeps the shared synchronous UI stores as a projection of the extension's
 * durable background state. UI edits are batched and committed atomically so a
 * closing popup cannot leave only half of a multi-store operation persisted.
 */
export function useSharedStateBridge(snapshot: AppSnapshot, refresh: () => Promise<void>, setError: (message: string) => void) {
  const applyingSnapshot = useRef(false)
  const lastFingerprint = useRef('')

  useEffect(() => {
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
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let writing = false
    let queuedPayload: ReturnType<typeof currentPayload> | undefined
    const flush = async () => {
      if (writing || !queuedPayload) return
      writing = true
      try {
        while (queuedPayload) {
          const payload = queuedPayload
          queuedPayload = undefined
          await request({ type: 'replace-data', ...payload })
        }
        if (!stopped) await refresh()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        writing = false
        if (queuedPayload) void flush()
      }
    }
    const commit = () => {
      if (applyingSnapshot.current) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const payload = currentPayload()
        const nextFingerprint = fingerprint(payload)
        if (nextFingerprint === lastFingerprint.current) return
        lastFingerprint.current = nextFingerprint
        queuedPayload = payload
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
      clearTimeout(timer)
      subscriptions.forEach((subscription) => subscription())
    }
  }, [refresh, setError])
}
