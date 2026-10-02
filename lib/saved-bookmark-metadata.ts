import { AppState, Platform } from 'react-native'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { getPrefetchedBookmarkMeta } from './bookmark-meta-cache'
import { canApplyBookmarkMetadata, needsBookmarkMetadata, resolveBookmarkMetadata } from './bookmark-metadata-utils'
import { resolveTitleWithWebView } from './webview-title-resolver'
import { isDeleted } from './nori-data'
import { backfillMissingTitles } from './title-backfill'
import { getFallbackIcon } from './bookmark'

const pending = new Map<string, Promise<void>>()

/** Enrich a saved placeholder without delaying saving or overwriting later edits. */
export function enrichSavedBookmark(id: string): Promise<void> {
  const existing = pending.get(id)
  if (existing) return existing

  const task = enrich(id).catch(() => {}).finally(() => pending.delete(id))
  pending.set(id, task)
  return task
}

async function enrich(id: string) {
  const previous = bookmarks$.bookmarks.peek().find((item) => item.id === id)
  if (!previous || isDeleted(previous) || !needsBookmarkMetadata(previous.title, previous.url)) return

  const preferRendered = Platform.OS !== 'web' && settings$.loadPagesForTitles.peek()
  // Leave a persisted placeholder for the foreground backfill if the app is asleep.
  if (preferRendered && AppState.currentState !== 'active') return

  const meta = await resolveBookmarkMetadata(previous.url, preferRendered, getPrefetchedBookmarkMeta, resolveTitleWithWebView)
  if (preferRendered && AppState.currentState !== 'active') return

  const current = bookmarks$.bookmarks.peek().find((item) => item.id === id)
  if (!current || !canApplyBookmarkMetadata(previous, current, isDeleted(current))) return

  bookmarks$.update(id, {
    title: meta.title || previous.title,
    icon: current.icon === previous.icon ? meta.icon || previous.icon || getFallbackIcon(previous.url) : current.icon,
  })
  if (Platform.OS !== 'web' && !preferRendered) void backfillMissingTitles()
}
