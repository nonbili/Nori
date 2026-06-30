import { bookmarks$ } from '@/states/bookmarks'
import { getFallbackIcon, getFallbackTitle } from '@/lib/bookmark'
import { isDeleted } from '@/lib/nori-data'
import { maxJobsPerRun, resolveTitleWithWebView } from '@/lib/webview-title-resolver'

// URLs we've already handed to the WebView this session, so repeated foreground
// passes don't keep re-loading sites that genuinely have no better title.
const attempted = new Set<string>()

let running = false

const hasPlaceholderTitle = (title: string, url: string) =>
  !title.trim() || title === getFallbackTitle(url)

/**
 * Find bookmarks whose title is still just the hostname placeholder (typically
 * saved via background quick-share, where no UI/WebView was available) and try to
 * resolve a real title using the hidden WebView. Safe to call repeatedly; it skips
 * URLs it has already attempted and only runs one pass at a time.
 *
 * Must be called while the app is foregrounded — the WebView can't run otherwise.
 */
export async function backfillMissingTitles() {
  if (running) {
    return
  }
  running = true

  try {
    const pending = bookmarks$.bookmarks
      .peek()
      .filter((item) => !isDeleted(item) && hasPlaceholderTitle(item.title, item.url) && !attempted.has(item.url))
      .slice(0, maxJobsPerRun)

    for (const item of pending) {
      attempted.add(item.url)

      const result = await resolveTitleWithWebView(item.url)
      if (!result?.title) {
        continue
      }

      // The row may have been edited/removed while we were resolving; re-check.
      const current = bookmarks$.bookmarks.peek().find((row) => row.id === item.id)
      if (!current || isDeleted(current) || !hasPlaceholderTitle(current.title, current.url)) {
        continue
      }

      bookmarks$.update(item.id, {
        title: result.title,
        icon: result.icon || current.icon || getFallbackIcon(item.url),
      })
    }
  } finally {
    running = false
  }
}
