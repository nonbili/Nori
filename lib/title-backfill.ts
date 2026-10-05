import { bookmarks$ } from '@/states/bookmarks'
import { getFallbackIcon } from '@/lib/bookmark'
import { isDeleted } from '@/lib/nori-data'
import { maxJobsPerRun, resolveTitleWithWebView } from '@/lib/webview-title-resolver'
import { hasPlaceholderTitle } from '@/lib/bookmark-title'
import { AppState, Platform } from 'react-native'
import { settings$ } from '@/states/settings'
import { getPrefetchedBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { resolveBookmarkMetadata } from '@/lib/bookmark-metadata-utils'

// URLs we've already handed to the WebView this session, so repeated foreground
// passes don't keep re-loading sites that genuinely have no better title.
const attempted = new Set<string>()

let running = false

/**
 * Find bookmarks whose title is still just the hostname placeholder (typically
 * saved via background quick-share, where no UI/WebView was available) and try to
 * resolve a real title using the hidden WebView. Safe to call repeatedly; it skips
 * URLs it has already attempted and only runs one pass at a time.
 *
 * Must be called while the app is foregrounded — the WebView can't run otherwise.
 */
export async function backfillMissingTitles() {
  if (running || Platform.OS === 'web' || AppState.currentState !== 'active') {
    return
  }
  running = true

  try {
    const pending = bookmarks$.bookmarks
      .peek()
      .filter((item) => !isDeleted(item) && hasPlaceholderTitle(item.title, item.url) && !attempted.has(item.url))
      .slice(0, settings$.loadPagesForTitles.peek() ? undefined : maxJobsPerRun)

    for (const item of pending) {
      if (AppState.currentState !== 'active') break
      attempted.add(item.url)

      const result = settings$.loadPagesForTitles.peek()
        ? await resolveBookmarkMetadata(item.url, true, getPrefetchedBookmarkMeta, resolveTitleWithWebView)
        : await resolveTitleWithWebView(item.url)
      if (AppState.currentState !== 'active') {
        attempted.delete(item.url)
        break
      }
      if (!result?.title || hasPlaceholderTitle(result.title, item.url)) {
        continue
      }

      // The row may have been edited/removed while we were resolving; re-check.
      const current = bookmarks$.bookmarks.peek().find((row) => row.id === item.id)
      if (!current || isDeleted(current) || current.url !== item.url || current.title !== item.title || AppState.currentState !== 'active') {
        continue
      }

      bookmarks$.update(item.id, {
        title: result.title,
        icon: current.icon === item.icon ? result.icon || current.icon || getFallbackIcon(item.url) : current.icon,
      })
    }
  } finally {
    running = false
  }
}

/**
 * A page rendered for its preview (see setPreviewRenderedMeta) also yields its
 * title. Use it for bookmarks still showing the placeholder, since the title
 * probe's desktop UA is rejected by the same bot protection as the fetch.
 */
export function applyRenderedTitle(url: string, title: string) {
  if (!title || hasPlaceholderTitle(title, url)) return
  for (const item of bookmarks$.bookmarks.peek()) {
    if (!isDeleted(item) && item.url === url && hasPlaceholderTitle(item.title, url)) {
      bookmarks$.update(item.id, { title })
    }
  }
}
