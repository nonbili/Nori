import { observable } from '@legendapp/state'

export interface WebViewTitleResult {
  title: string
  icon: string
}

export interface PendingJob {
  id: number
  url: string
}

// Resolver callbacks are kept out of the observable store on purpose — legend-state
// would otherwise proxy them. Keyed by job id.
const resolvers = new Map<number, (result: WebViewTitleResult | null) => void>()

// Some sites (e.g. fifa.com) are pure client-side SPAs whose <title>/og:title are
// injected by JavaScript, so a plain fetch only ever sees an empty HTML shell. We
// load such URLs in a hidden WebView, let their JS run, and read the title back.
//
// A WebView can only run while the app is foregrounded and the host component is
// mounted, so this is a best-effort fallback layered on top of the fetch path.

const MAX_JOBS_PER_RUN = 8

let nextJobId = 1

export const webViewResolver$ = observable<{
  active: PendingJob | null
  queue: PendingJob[]
}>({
  active: null,
  queue: [],
})

function pumpQueue() {
  if (webViewResolver$.active.peek()) {
    return
  }

  const queue = webViewResolver$.queue.peek()
  if (queue.length === 0) {
    return
  }

  const [next, ...rest] = queue
  webViewResolver$.queue.set(rest)
  webViewResolver$.active.set(next)
}

/**
 * Queue a URL to have its title resolved by the hidden WebView. Resolves with the
 * extracted metadata, or `null` if no host is mounted / it times out / it errors.
 */
export function resolveTitleWithWebView(url: string): Promise<WebViewTitleResult | null> {
  return new Promise((resolve) => {
    const job: PendingJob = { id: nextJobId++, url }
    resolvers.set(job.id, resolve)
    webViewResolver$.queue.set([...webViewResolver$.queue.peek(), job])
    pumpQueue()
  })
}

/** Called by the host component when a job finishes (or fails/times out). */
export function completeActiveJob(jobId: number, result: WebViewTitleResult | null) {
  const active = webViewResolver$.active.peek()
  if (!active || active.id !== jobId) {
    return
  }

  const resolve = resolvers.get(jobId)
  resolvers.delete(jobId)
  resolve?.(result)

  webViewResolver$.active.set(null)
  pumpQueue()
}

/** Limit how many URLs a single backfill pass will hand to the WebView. */
export const maxJobsPerRun = MAX_JOBS_PER_RUN

// Injected into the loaded page. Polls briefly so SPA-rendered titles have a
// chance to populate before we read them, then posts the result back once.
export const INJECTED_TITLE_SCRIPT = `
(function () {
  if (window.__noriTitleProbe) { return; }
  window.__noriTitleProbe = true;
  function metaContent(selector) {
    var el = document.querySelector(selector);
    return el && el.getAttribute('content');
  }
  function readTitle() {
    return (
      metaContent('meta[property="og:title"]') ||
      metaContent('meta[name="twitter:title"]') ||
      (document.title || '') ||
      metaContent('meta[property="og:site_name"]') ||
      ''
    ).trim();
  }
  function readIcon() {
    var el = document.querySelector('link[rel*="icon"]');
    return el ? el.href : '';
  }
  function post() {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ title: readTitle(), icon: readIcon() })
      );
    } catch (e) {}
  }
  var tries = 0;
  function tick() {
    tries += 1;
    if (readTitle() || tries >= 25) {
      post();
    } else {
      setTimeout(tick, 200);
    }
  }
  tick();
})();
true;
`
