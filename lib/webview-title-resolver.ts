import { observable } from '@legendapp/state'
import { REDDIT_PLACEHOLDER_TITLES } from './bookmark-title'

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
const pendingUrls = new Map<string, Promise<WebViewTitleResult | null>>()
let available = false

/** The host pauses work in the background and cancels jobs on unmount. */
export function setWebViewTitleResolverAvailable(value: boolean) {
  available = value
  if (value) {
    pumpQueue()
  } else {
    webViewResolver$.active.set(null)
    webViewResolver$.queue.set([])
    for (const resolve of resolvers.values()) resolve(null)
    resolvers.clear()
    pendingUrls.clear()
  }
}

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
  if (!available || webViewResolver$.active.peek()) {
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
  if (!available) return Promise.resolve(null)
  const pending = pendingUrls.get(url)
  if (pending) return pending
  const request = new Promise<WebViewTitleResult | null>((resolve) => {
    const job: PendingJob = { id: nextJobId++, url }
    resolvers.set(job.id, resolve)
    webViewResolver$.queue.set([...webViewResolver$.queue.peek(), job])
    pumpQueue()
  })
  pendingUrls.set(url, request)
  void request.then(() => {
    if (pendingUrls.get(url) === request) pendingUrls.delete(url)
  })
  return request
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
    var hostname = window.location.hostname;
    var isReddit = hostname === 'redd.it' || hostname === 'reddit.com' || /\\.reddit\\.com$/.test(hostname);
    var match = isReddit && (hostname === 'redd.it'
      ? window.location.pathname.match(/^\\/([a-z0-9]+)\\/?$/i)
      : window.location.pathname.match(/\\/comments\\/([a-z0-9]+)(?:\\/|$)/i));
    var postId = match ? match[1].toLowerCase() : '';
    var post = postId && document.querySelector('shreddit-post[id="t3_' + postId + '"]');
    var heading = post && post.querySelector('[slot="title"]');
    var oldTitle = postId && document.querySelector('.thing[data-fullname="t3_' + postId + '"] a.title');
    var candidates = [
      post && post.getAttribute('post-title'),
      heading && heading.textContent,
      oldTitle && oldTitle.textContent,
      document.title,
      metaContent('meta[property="og:title"]'),
      metaContent('meta[name="twitter:title"]'),
      metaContent('meta[property="og:site_name"]')
    ];
    var placeholders = ${JSON.stringify(REDDIT_PLACEHOLDER_TITLES)};
    for (var i = 0; i < candidates.length; i++) {
      var title = (candidates[i] || '').trim();
      if (!title || title === hostname.replace(/^www\\./, '')) { continue; }
      if (isReddit && placeholders.some(function (value) { return value.toLowerCase() === title.toLowerCase(); })) { continue; }
      return title;
    }
    return '';
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
  var lastTitle = '';
  var stableTicks = 0;
  function tick() {
    tries += 1;
    var title = readTitle();
    stableTicks = title && title === lastTitle ? stableTicks + 1 : 0;
    lastTitle = title;
    // Allow at least 1.6 seconds for hydration, then require one second without
    // a title change. Stop after five seconds even if the page never settles.
    if ((tries >= 9 && stableTicks >= 5) || tries >= 26) {
      post();
    } else {
      setTimeout(tick, 200);
    }
  }
  tick();
})();
true;
`
