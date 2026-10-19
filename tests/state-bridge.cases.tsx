import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import { act } from 'react'
import { observable } from '@legendapp/state'
import { createProfile } from '../extension/lib/domain'
import type { AppSnapshot, Preferences, RequestMessage } from '../extension/lib/model'
import { advance, deferred, microtasks } from './support/async'

const window = new Window({ url: 'https://nori.test' })
Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true })
const preferences = (): Preferences => ({
  theme: 'system', fontScale: 1, fontFamily: 'system', accent: 'emerald', language: null,
  lastListId: 'builtin-later', bookmarkView: 'compact', previewImageSource: 'page-image', showFavicons: true,
  newBookmarksAtTop: true, loadPagesForTitles: false, autoCheckUpdates: true, closeToTray: true,
})
const snapshot = (): AppSnapshot => ({
  profileId: 'user:alice', profile: createProfile('alice'), preferences: preferences(),
  auth: { loaded: true, userId: 'alice', email: 'alice@example.com', plan: 'pro', source: 'stripe' }, syncing: false,
})
const settings$ = observable({
  theme: null as string | null, fontScale: 1, fontFamily: 'system', accent: 'emerald', language: null as string | null,
  lastSelectedListId: '', bookmarkView: 'compact', previewImageSource: 'page-image', showFavicon: true,
  newBookmarksAtTop: true, loadPagesForTitles: false, autoCheckUpdates: true, closeToTray: true,
})
const lists$ = observable({ lists: createProfile().lists })
const bookmarks$ = observable({ bookmarks: createProfile().bookmarks })
const history$ = observable({ openedBookmarks: [] as { id: string; url: string; title: string; icon: string; openedAt: number }[] })
const auth$ = observable({ loaded: false, userId: undefined as string | undefined, userEmail: undefined as string | undefined, plan: 'free', source: 'none' })
const syncMeta$ = observable({ inFlight: false, lastError: undefined as string | undefined, lastSyncAt: undefined as number | undefined })
for (const [name, store] of Object.entries({ settings$, lists$, bookmarks$, history$, auth$, syncMeta$ })) {
  const moduleName = name === 'syncMeta$' ? 'sync-meta' : name.slice(0, -1)
  mock.module(`nori-root/states/${moduleName}`, () => ({ [name]: store }))
}
const prune = mock(async (_urls: string[]) => {})
mock.module('nori-root/lib/bookmark-preview', () => ({ updatePreviewBookmarks: prune }))
type Write = Extract<RequestMessage, { type: 'replace-data' }>
let durable: AppSnapshot
const persist = (message: Write) => {
  durable = {
    ...durable,
    profile: { ...durable.profile, lists: structuredClone(message.lists), bookmarks: structuredClone(message.bookmarks), history: structuredClone(message.history || []) },
    preferences: { ...durable.preferences, ...message.preferences },
  }
}
const request = mock(async (message: Write) => { persist(message) })
mock.module('../extension/lib/client', () => ({ request }))
const { useSharedStateBridge } = await import('../extension/components/useSharedStateBridge')
const { createRoot } = await import('react-dom/client')
const container = document.createElement('div')
document.body.append(container)
let root: ReturnType<typeof createRoot>
const setError = mock((_message: string) => {})
const refresh = mock(async () => { root.render(<Harness value={structuredClone(durable)} />) })
function Harness({ value }: { value: AppSnapshot }) {
  useSharedStateBridge(value, refresh, setError)
  return null
}
async function render(value = durable) {
  await act(async () => { root.render(<Harness value={structuredClone(value)} />); await microtasks() })
}
async function tick(ms = 40) { await act(async () => advance(ms)) }
async function change(run: () => void) { await act(async () => { run(); await microtasks() }) }

beforeEach(async () => {
  jest.useFakeTimers()
  durable = snapshot()
  for (const fn of [request, refresh, setError, prune]) fn.mockClear()
  root = createRoot(container as unknown as HTMLElement)
  await render()
})
afterEach(async () => {
  await act(async () => { root.unmount(); await microtasks() })
  jest.clearAllTimers(); jest.useRealTimers()
})

describe('durable state bridge', () => {
  test('projects remote preferences, history and auth without echoing a write', async () => {
    durable.preferences = { ...preferences(), theme: 'dark', previewImageSource: 'none', fontScale: 1.2 }
    durable.profile.history = [{ id: 'history', url: 'https://read.example', title: 'Read', icon: '', openedAt: '2026-10-18T00:00:00.000Z' }]
    await render()
    await tick(100)
    expect(settings$.theme.peek()).toBe('dark')
    expect(settings$.previewImageSource.peek()).toBe('none')
    expect(history$.openedBookmarks.peek()[0].openedAt).toBe(Date.parse('2026-10-18T00:00:00.000Z'))
    expect(auth$.userId.peek()).toBe('alice')
    expect(request).not.toHaveBeenCalled()
  })

  test('debounces edits across stores into one atomic write', async () => {
    await change(() => {
      lists$.lists.set(lists$.lists.peek().map((list, index) => index === 0 ? { ...list, name: 'Renamed' } : list))
      bookmarks$.bookmarks.set(bookmarks$.bookmarks.peek().map((row, index) => index === 0 ? { ...row, title: 'Edited' } : row))
      settings$.theme.set('dark')
      history$.openedBookmarks.set([{ id: 'read', url: 'https://read.example', title: 'Read', icon: '', openedAt: Date.parse('2026-10-18T00:00:00.000Z') }])
    })
    await tick(39)
    expect(request).not.toHaveBeenCalled()
    await tick(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toMatchObject({
      type: 'replace-data', lists: [{ name: 'Renamed' }, ...durable.profile.lists.slice(1)],
      preferences: { theme: 'dark' }, history: [{ openedAt: '2026-10-18T00:00:00.000Z' }],
    })
    expect(durable.profile.bookmarks[0].title).toBe('Edited')
  })

  test('a snapshot arriving during debounce cannot overwrite a local edit', async () => {
    await change(() => settings$.theme.set('dark'))
    const stale = snapshot()
    stale.preferences.theme = 'light'
    await render(stale)
    expect(settings$.theme.peek()).toBe('dark')
    await tick()
    expect(durable.preferences.theme).toBe('dark')
    expect(settings$.theme.peek()).toBe('dark')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('a snapshot arriving during a write waits until the latest queued edit is durable', async () => {
    const gate = deferred()
    request.mockImplementationOnce(async (message) => { await gate.promise; persist(message) })
    await change(() => settings$.theme.set('dark'))
    await tick()
    await render(snapshot())
    expect(settings$.theme.peek()).toBe('dark')
    await change(() => settings$.theme.set('amoled'))
    await tick()
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => { gate.resolve(); await microtasks() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(durable.preferences.theme).toBe('amoled')
    expect(settings$.theme.peek()).toBe('amoled')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('a failed write reports the error and later edits can persist and accept new snapshots', async () => {
    request.mockRejectedValueOnce(new Error('Storage unavailable'))
    await change(() => settings$.theme.set('dark'))
    await tick()
    expect(setError).toHaveBeenCalledWith('Storage unavailable')
    expect(durable.preferences.theme).toBe('system')
    await change(() => settings$.theme.set('amoled'))
    await tick()
    expect(durable.preferences.theme).toBe('amoled')
    const remote = snapshot()
    remote.preferences.theme = 'light'
    await render(remote)
    expect(settings$.theme.peek()).toBe('light')
  })

  test('a no-op local notification does not leave a missed snapshot blocked', async () => {
    await change(() => settings$.theme.set('dark'))
    await change(() => settings$.theme.set(null))
    const remote = snapshot()
    remote.preferences.theme = 'light'
    durable = remote
    await render(remote)
    await tick()
    expect(request).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(settings$.theme.peek()).toBe('light')
  })

  test('an in-flight save completes after unmount without refreshing the inactive view', async () => {
    const gate = deferred()
    request.mockImplementationOnce(async (message) => { await gate.promise; persist(message) })
    await change(() => settings$.theme.set('dark'))
    await tick()
    await act(async () => root.unmount())
    await act(async () => { gate.resolve(); await microtasks() })
    expect(durable.preferences.theme).toBe('dark')
    expect(refresh).not.toHaveBeenCalled()
    await change(() => settings$.theme.set('light'))
    await tick(100)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
