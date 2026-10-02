import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { runInNewContext } from 'node:vm'
import {
  completeActiveJob,
  resolveTitleWithWebView,
  webViewResolver$,
  INJECTED_TITLE_SCRIPT,
  setWebViewTitleResolverAvailable,
} from './webview-title-resolver'

beforeEach(() => setWebViewTitleResolverAvailable(true))
afterEach(() => {
  setWebViewTitleResolverAvailable(false)
})

describe('webview title probe', () => {
  function probe(readPostTitle: () => string, pageTitle = 'Reddit', hostname = 'www.reddit.com') {
    const messages: { title: string; icon: string }[] = []
    const timers: (() => void)[] = []
    runInNewContext(INJECTED_TITLE_SCRIPT, {
      window: {
        location: { hostname, pathname: '/r/test/comments/abc123/' },
        ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) },
      },
      document: {
        get title() { return pageTitle },
        querySelector: (selector: string) => {
          if (selector === 'shreddit-post[id="t3_abc123"]' && readPostTitle()) {
            return { getAttribute: () => readPostTitle(), querySelector: () => null }
          }
          return null
        },
      },
      setTimeout: (callback: () => void) => timers.push(callback),
    })
    return { messages, timers, setPageTitle: (value: string) => { pageTitle = value } }
  }

  it('waits past the Reddit loading title until the post renders', () => {
    let title = ''
    const { messages, timers } = probe(() => title)
    expect(messages).toHaveLength(0)
    title = 'Actual post title'
    while (timers.length) timers.shift()!()
    expect(messages).toEqual([{ title, icon: '' }])
  })

  it('returns an empty title when Reddit stays on a loading page', () => {
    const { messages, timers } = probe(() => '')
    while (timers.length) timers.shift()!()
    expect(messages).toEqual([{ title: '', icon: '' }])
  })

  it('preserves normal titles on other sites', () => {
    const { messages, timers } = probe(() => '', 'Reddit', 'example.com')
    expect(messages).toHaveLength(0)
    while (timers.length) timers.shift()!()
    expect(messages).toEqual([{ title: 'Reddit', icon: '' }])
  })

  it('waits for an initially plausible title to change during hydration', () => {
    const { messages, timers, setPageTitle } = probe(() => '', 'Example site', 'example.com')
    for (let i = 0; i < 7; i++) timers.shift()!()
    expect(messages).toHaveLength(0)
    setPageTitle('Actual article title')
    while (timers.length) timers.shift()!()
    expect(messages).toEqual([{ title: 'Actual article title', icon: '' }])
  })
})

describe('webview title resolver queue', () => {
  it('returns null when no foreground host is available', async () => {
    setWebViewTitleResolverAvailable(false)
    await expect(resolveTitleWithWebView('https://example.com')).resolves.toBeNull()
    expect(webViewResolver$.active.peek()).toBeNull()
  })

  it('cancels active and queued jobs when the host goes away', async () => {
    const first = resolveTitleWithWebView('https://a.com')
    const second = resolveTitleWithWebView('https://b.com')
    setWebViewTitleResolverAvailable(false)
    await expect(first).resolves.toBeNull()
    await expect(second).resolves.toBeNull()
    expect(webViewResolver$.active.peek()).toBeNull()
    expect(webViewResolver$.queue.peek()).toEqual([])
  })

  it('shares simultaneous requests for the same URL', async () => {
    const first = resolveTitleWithWebView('https://a.com')
    const second = resolveTitleWithWebView('https://a.com')
    expect(second).toBe(first)
    expect(webViewResolver$.queue.peek()).toEqual([])
    completeActiveJob(webViewResolver$.active.peek()!.id, { title: 'A', icon: '' })
    await expect(second).resolves.toEqual({ title: 'A', icon: '' })
  })
  it('activates the first queued job and resolves it on completion', async () => {
    const promise = resolveTitleWithWebView('https://example.com/page')

    const active = webViewResolver$.active.peek()
    expect(active?.url).toBe('https://example.com/page')
    expect(webViewResolver$.queue.peek()).toHaveLength(0)

    completeActiveJob(active!.id, { title: 'Real Title', icon: 'https://example.com/icon.png' })

    await expect(promise).resolves.toEqual({ title: 'Real Title', icon: 'https://example.com/icon.png' })
    expect(webViewResolver$.active.peek()).toBeNull()
  })

  it('processes jobs one at a time in order', async () => {
    const first = resolveTitleWithWebView('https://a.com')
    const second = resolveTitleWithWebView('https://b.com')

    // Only the first job is active; the second waits in the queue.
    expect(webViewResolver$.active.peek()?.url).toBe('https://a.com')
    expect(webViewResolver$.queue.peek()).toHaveLength(1)

    completeActiveJob(webViewResolver$.active.peek()!.id, null)
    await expect(first).resolves.toBeNull()

    // Finishing the first promotes the second.
    expect(webViewResolver$.active.peek()?.url).toBe('https://b.com')

    completeActiveJob(webViewResolver$.active.peek()!.id, { title: 'B', icon: '' })
    await expect(second).resolves.toEqual({ title: 'B', icon: '' })
  })

  it('ignores completion for a non-active job id', () => {
    void resolveTitleWithWebView('https://a.com')
    const activeId = webViewResolver$.active.peek()!.id

    completeActiveJob(activeId + 999, { title: 'x', icon: '' })

    // Still active and unchanged.
    expect(webViewResolver$.active.peek()?.id).toBe(activeId)
  })
})
