import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import type { AppSnapshot, RequestMessage, ResponseMessage, AuthState } from '../extension/lib/model'
import { syncServer } from './support/sync-server'
import { microtasks } from './support/async'

const server = syncServer()
let values: Record<string, unknown> = {}
let session: { access_token: string; user: { id: string; email: string } } | null = null
let nextUser = 'alice'
const signOutHost = mock(async () => { session = null; return { error: null } })
mock.module('@supabase/supabase-js', () => ({ createClient: () => ({
  schema: () => server,
  auth: {
    getSession: async () => ({ data: { session } }),
    signOut: signOutHost,
    verifyOtp: async () => {
      session = { access_token: 'test-token', user: { id: nextUser, email: `${nextUser}@example.com` } }
      return { error: null }
    },
  },
}) }))
mock.module('nori/lib/nori-api', () => ({ fetchNoriMe: async () => ({ plan: 'pro', source: 'stripe' }) }))
let listener: (message: RequestMessage, sender: unknown, respond: (response: ResponseMessage) => void) => boolean
mock.module('wxt/browser', () => ({ browser: {
  storage: { local: {
    get: async (key: string) => ({ [key]: structuredClone(values[key]) }),
    set: async (entries: Record<string, unknown>) => { Object.assign(values, structuredClone(entries)) },
    remove: async (key: string) => { delete values[key] },
  } },
  runtime: { sendMessage: async () => {}, onMessage: { addListener: (next: typeof listener) => { listener = next } } },
  alarms: { create() {}, onAlarm: { addListener() {} } },
  permissions: { request: async () => true },
  identity: {
    getRedirectURL: () => 'https://extension.test/auth',
    launchWebAuthFlow: async ({ url }: { url: string }) => {
      const state = new URL(url).searchParams.get('state')!
      return `https://extension.test/auth?state=${state}&t=test-token`
    },
  },
} }))
Object.assign(globalThis, { defineBackground: (main: () => void) => main })
const { defaultState, loadState, saveState } = await import('../extension/lib/storage')
const { activateAccount, finishPromotion } = await import('../extension/lib/api')
const { default: background } = await import('../extension/entrypoints/background')
;(background as unknown as () => void)()
await microtasks()

const request = <T = AppSnapshot>(message: RequestMessage) => new Promise<ResponseMessage<T>>((resolve) => {
  listener(message, {}, (response) => resolve(response as ResponseMessage<T>))
})
const auth = (userId: string): AuthState => ({ loaded: true, userId, email: `${userId}@example.com`, plan: 'pro', source: 'stripe' })
function addAnonymousBookmark(state: ReturnType<typeof defaultState>) {
  state.profiles.anonymous.bookmarks.push({
    id: 'my-bookmark', listId: 'builtin-later', url: 'https://mine.example/', title: 'Mine', icon: '',
    json: { tags: ['reading'], note: 'Keep this' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  })
  state.profiles.anonymous.pendingBookmarkIds.push('my-bookmark')
}
beforeEach(async () => {
  jest.useFakeTimers()
  await request({ type: 'sign-out' })
  server.reset(); values = {}; signOutHost.mockClear(); nextUser = 'alice'
})
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers() })

describe('account profile isolation', () => {
  test('promotes anonymous edits into an independent account profile', () => {
    const state = defaultState()
    addAnonymousBookmark(state)
    const anonymous = structuredClone(state.profiles.anonymous)
    activateAccount(state, auth('alice'))
    expect(state.activeProfileId).toBe('user:alice')
    expect(state.profiles['user:alice']).toMatchObject({ ownerId: 'alice', promotedFromAnonymous: true, pendingBookmarkIds: ['my-bookmark'] })
    state.profiles['user:alice'].bookmarks.find((row) => row.id === 'my-bookmark')!.json.note = 'Changed in account'
    expect(state.profiles.anonymous).toEqual(anonymous)
  })

  test('a pristine anonymous profile creates a fresh account without pending promotion', () => {
    const state = defaultState()
    activateAccount(state, auth('alice'))
    expect(state.profiles['user:alice'].promotedFromAnonymous).toBeUndefined()
    expect(state.profiles['user:alice'].pendingBookmarkIds).toEqual([])
  })

  test('switching back restores the existing profile and its own cursors and pending edits', () => {
    const state = defaultState()
    addAnonymousBookmark(state)
    activateAccount(state, auth('alice'))
    finishPromotion(state, state.profiles['user:alice'])
    state.profiles['user:alice'].bookmarksCursor = 'alice-cursor'
    state.profiles['user:alice'].listsCursor = 'alice-list-cursor'
    const alice = structuredClone(state.profiles['user:alice'])
    activateAccount(state, auth('bob'))
    expect(state.profiles['user:bob'].bookmarks.some((row) => row.id === 'my-bookmark')).toBe(false)
    expect(state.profiles['user:bob'].bookmarksCursor).toBeUndefined()
    expect(state.profiles['user:bob'].pendingBookmarkIds).toEqual([])
    state.profiles['user:bob'].bookmarksCursor = 'bob-cursor'
    activateAccount(state, auth('alice'))
    expect(state.profiles['user:alice']).toEqual(alice)
    expect(state.profiles['user:bob'].bookmarksCursor).toBe('bob-cursor')
  })
})

describe('background account lifecycle', () => {
  test('failed initial sync keeps anonymous data until retry completes promotion', async () => {
    const state = defaultState()
    addAnonymousBookmark(state)
    await saveState(state)
    server.intercept((query) => { if (query.write) throw new Error('Offline') })
    const signedIn = await request({ type: 'sign-in' })
    expect(signedIn.ok).toBe(true)
    expect(signedIn.data?.syncError).toBe('Offline')
    let stored = await loadState()
    expect(stored.profiles.anonymous.bookmarks.some((row) => row.id === 'my-bookmark')).toBe(true)
    expect(stored.profiles['user:alice'].promotedFromAnonymous).toBe(true)
    server.intercept()
    expect((await request({ type: 'sync' })).ok).toBe(true)
    stored = await loadState()
    expect(stored.profiles.anonymous.bookmarks.some((row) => row.id === 'my-bookmark')).toBe(false)
    expect(stored.profiles['user:alice'].bookmarks.some((row) => row.id === 'my-bookmark')).toBe(true)
    expect(stored.profiles['user:alice'].promotedFromAnonymous).toBe(false)
  })

  test('sign-out stops uploads, preserves offline data, and a second user gets an isolated profile', async () => {
    const state = defaultState()
    addAnonymousBookmark(state)
    await saveState(state)
    const signedIn = await request({ type: 'sign-in' })
    expect(signedIn.ok).toBe(true)
    const alice = structuredClone((await loadState()).profiles['user:alice'])
    const signedOut = await request({ type: 'sign-out' })
    expect(signedOut.data?.auth).toMatchObject({ plan: 'free', source: 'none' })
    expect(signedOut.data?.auth.userId).toBeUndefined()
    expect(signOutHost).toHaveBeenCalledWith({ scope: 'local' })
    const calls = server.calls.length
    await request({ type: 'sync' })
    expect(server.calls).toHaveLength(calls)
    server.reset()
    nextUser = 'bob'
    const bob = await request({ type: 'sign-in' })
    expect(bob.ok).toBe(true)
    expect(bob.data?.profileId).toBe('user:bob')
    expect(bob.data?.profile.bookmarks.some((row) => row.id === 'my-bookmark')).toBe(false)
    expect((await loadState()).profiles['user:alice']).toEqual(alice)
    const pulls = server.calls.filter((query) => !query.write)
    const writes = server.calls.flatMap((query) => query.write || [])
    expect(pulls.length).toBeGreaterThan(0)
    expect(writes.length).toBeGreaterThan(0)
    expect(pulls.every((query) => query.cursor === undefined)).toBe(true)
    expect(writes.every((row) => row.user_id === 'bob')).toBe(true)
  })
})
