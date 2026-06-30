import { afterEach, describe, expect, it } from 'bun:test'
import {
  completeActiveJob,
  resolveTitleWithWebView,
  webViewResolver$,
} from './webview-title-resolver'

afterEach(() => {
  webViewResolver$.active.set(null)
  webViewResolver$.queue.set([])
})

describe('webview title resolver queue', () => {
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
