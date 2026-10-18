import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { observable } from '@legendapp/state'
import { createStarterBookmarks, createStarterLists, type BookmarkRecordData } from '../lib/nori-data'
import { advance, microtasks, settle } from './support/async'
import { syncServer } from './support/sync-server'
import { SYNC_PAGE_SIZE } from '../lib/supabase/sync-paging'

const auth$ = observable({ userId: undefined as string | undefined, plan: 'pro' })
const lists$ = observable({ lists: createStarterLists() })
const bookmarks$ = observable({ bookmarks: createStarterBookmarks() })
const initialMeta = () => ({
  inFlight: false, lastSyncAt: undefined as number | undefined, lastError: undefined as string | undefined,
  pendingListIds: [] as string[], pendingBookmarkIds: [] as string[],
  syncUserId: undefined as string | undefined, syncListsCursor: undefined as string | undefined,
  syncBookmarksCursor: undefined as string | undefined, lastFullPullAt: undefined as number | undefined,
})
const syncMeta$ = observable(initialMeta())
const server = syncServer()
mock.module('@/states/auth', () => ({ auth$ }))
mock.module('@/states/lists', () => ({ lists$ }))
mock.module('@/states/bookmarks', () => ({ bookmarks$ }))
mock.module('@/states/sync-meta', () => ({ syncMeta$ }))
mock.module('@/lib/supabase/client', () => ({ supabase: server }))
const { startSupabaseSyncWatchers, syncSupabase } = await import('../lib/supabase/sync')
startSupabaseSyncWatchers()

const bookmark = (): BookmarkRecordData => ({
  id: 'local', listId: 'builtin-later', url: 'https://local.example/', title: 'Original', icon: '',
  json: { visible: true }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
function edit(title: string) {
  bookmarks$.bookmarks.set(bookmarks$.bookmarks.peek().map((row) => row.id === 'local'
    ? { ...row, title, updatedAt: new Date(Date.now()).toISOString() } : row))
}
const local = () => bookmarks$.bookmarks.peek().find((row) => row.id === 'local')!
const writes = () => server.calls.filter((query) => query.write)
function seedRemoteBookmarks(count: number) {
  server.tables.bookmarks = Array.from({ length: count }, (_, index) => ({
    id: `remote-${String(index).padStart(4, '0')}`, list_id: 'builtin-later', url: `https://remote.example/${index}`,
    title: 'Remote', icon: '', json: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }))
}

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-10-18T00:00:00.000Z') })
  auth$.userId.set(undefined)
  server.reset()
  lists$.lists.set(createStarterLists())
  bookmarks$.bookmarks.set([...createStarterBookmarks(), bookmark()])
  syncMeta$.set(initialMeta())
  auth$.userId.set('user-a')
})
afterEach(async () => {
  auth$.userId.set(undefined)
  await advance(10000)
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('complete sync cycle', () => {
  test('uploads pending changes, persists server timestamps and clears only acknowledged work', async () => {
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    expect(server.tables.bookmarks.find((row) => row.id === 'local')).toMatchObject({ title: 'Original', user_id: 'user-a' })
    expect(local().updatedAt).toBe(server.tables.bookmarks.find((row) => row.id === 'local')!.updated_at)
    expect(syncMeta$.pendingBookmarkIds.peek()).toEqual([])
    expect(syncMeta$.lastSyncAt.peek()).toBe(Date.now())
    expect(syncMeta$.inFlight.peek()).toBe(false)
    expect(syncMeta$.lastError.peek()).toBeUndefined()
  })

  test('an edit during a pull survives the stale response and is uploaded by the retry', async () => {
    const held = server.holdNext((query) => query.table === 'bookmarks' && !query.write)
    const syncing = syncSupabase()
    await advance(0)
    await held.entered
    try {
      edit('Edited during pull')
      expect(syncMeta$.pendingBookmarkIds.peek()).toContain('local')
    } finally { held.release() }
    await settle(syncing)
    expect(local().title).toBe('Edited during pull')
    expect(server.tables.bookmarks.find((row) => row.id === 'local')?.title).toBe('Edited during pull')
    expect(syncMeta$.pendingBookmarkIds.peek()).not.toContain('local')
  })

  test('an edit during a push is not overwritten by the upload acknowledgement', async () => {
    const held = server.holdNext((query) => query.table === 'bookmarks' && Boolean(query.write))
    const syncing = syncSupabase()
    await advance(0)
    await held.entered
    try { edit('Edited during push') } finally { held.release() }
    await microtasks()
    expect(local().title).toBe('Edited during push')
    expect(syncMeta$.pendingBookmarkIds.peek()).toContain('local')
    await settle(syncing)
    expect(server.tables.bookmarks.find((row) => row.id === 'local')?.title).toBe('Edited during push')
    expect(writes().filter((query) => query.table === 'bookmarks')).toHaveLength(2)
  })

  test('a bookmark upload failure retains pending work and cursors until a successful retry', async () => {
    syncMeta$.assign({ syncUserId: 'user-a', syncListsCursor: '2026-01-01T00:00:00.000Z', syncBookmarksCursor: '2026-01-01T00:00:00.000Z' })
    server.intercept((query) => {
      if (query.table === 'bookmarks' && query.write) throw { message: 'Upload failed', code: '503' }
    })
    await expect(settle(syncSupabase())).rejects.toMatchObject({ message: 'Upload failed' })
    expect(server.tables.lists.length).toBeGreaterThan(0) // Earlier table already succeeded.
    expect(syncMeta$.pendingBookmarkIds.peek()).toContain('local')
    expect(syncMeta$.syncBookmarksCursor.peek()).toBe('2026-01-01T00:00:00.000Z')
    expect(syncMeta$.lastSyncAt.peek()).toBeUndefined()
    expect(syncMeta$.lastError.peek()).toBe('Upload failed (503)')
    expect(syncMeta$.inFlight.peek()).toBe(false)
    server.intercept()
    await settle(syncSupabase())
    expect(server.tables.bookmarks.find((row) => row.id === 'local')?.title).toBe('Original')
    expect(syncMeta$.pendingBookmarkIds.peek()).toEqual([])
    expect(syncMeta$.lastError.peek()).toBeUndefined()
  })

  test('a failed pull never pushes against an incomplete snapshot', async () => {
    server.intercept((query) => { if (query.table === 'bookmarks' && !query.write) throw new Error('Offline') })
    await expect(settle(syncSupabase())).rejects.toThrow('Offline')
    expect(writes()).toEqual([])
    expect(local().title).toBe('Original')
    expect(syncMeta$.syncUserId.peek()).toBeUndefined()
  })

  test('switching accounts forces a full pull instead of reusing the previous account cursors', async () => {
    syncMeta$.assign({
      syncUserId: 'user-b', syncListsCursor: '2026-10-17T00:00:00.000Z',
      syncBookmarksCursor: '2026-10-17T00:00:00.000Z', lastFullPullAt: Date.now(),
    })
    await settle(syncSupabase())
    const pulls = server.calls.filter((query) => !query.write)
    expect(pulls.length).toBeGreaterThan(0)
    expect(pulls.every((query) => query.cursor === undefined)).toBe(true)
    expect(syncMeta$.syncUserId.peek()).toBe('user-a')
    expect(syncMeta$.syncBookmarksCursor.peek()).toBeUndefined() // Empty new account cannot inherit the old cursor.
  })

  test('signing out while a pull is in flight discards the response without uploading or stamping success', async () => {
    const held = server.holdNext((query) => query.table === 'bookmarks' && !query.write)
    const syncing = syncSupabase()
    await advance(0)
    await held.entered
    auth$.userId.set(undefined)
    held.release()
    await settle(syncing)
    expect(writes()).toEqual([])
    expect(syncMeta$.lastSyncAt.peek()).toBeUndefined()
    expect(syncMeta$.syncUserId.peek()).toBeUndefined()
  })

  test.each(['lists', 'bookmarks'] as const)('switching accounts during a %s upload does not apply its acknowledgement or start another upload', async (table) => {
    const held = server.holdNext((query) => query.table === table && Boolean(query.write))
    const syncing = syncSupabase()
    await advance(0)
    await held.entered
    const sent = writes().length
    auth$.userId.set('user-b')
    held.release()
    await settle(syncing)
    expect(writes()).toHaveLength(sent)
    expect(syncMeta$.pendingBookmarkIds.peek()).toContain('local')
    expect(syncMeta$.lastSyncAt.peek()).toBeUndefined()
    expect(syncMeta$.syncUserId.peek()).toBeUndefined()
  })

  test.each(['lists', 'bookmarks'] as const)('stops a multi-batch %s upload after sign-out during the first batch', async (table) => {
    const extras = Array.from({ length: SYNC_PAGE_SIZE + 1 }, (_, index) => ({
      ...bookmark(), id: `bulk-${String(index).padStart(4, '0')}`, url: `https://bulk.example/${index}`,
    }))
    if (table === 'bookmarks') bookmarks$.bookmarks.set([...bookmarks$.bookmarks.peek(), ...extras])
    else lists$.lists.set([...lists$.lists.peek(), ...extras.map((row) => ({ ...row, name: row.id }))])
    const held = server.holdNext((query) => query.table === table && Boolean(query.write))
    const syncing = syncSupabase()
    await advance(0)
    const first = await held.entered
    expect(first.write).toHaveLength(SYNC_PAGE_SIZE)
    auth$.userId.set(undefined)
    held.release()
    await settle(syncing)
    expect(writes().filter((query) => query.table === table)).toHaveLength(1)
    expect(syncMeta$.pendingBookmarkIds.peek()).toContain('local')
    expect(syncMeta$.lastSyncAt.peek()).toBeUndefined()
    expect(syncMeta$.lastError.peek()).toBeUndefined()
  })

  test('stops a paginated pull before requesting another page after an account switch', async () => {
    seedRemoteBookmarks(SYNC_PAGE_SIZE + 1)
    const held = server.holdNext((query) => query.table === 'bookmarks' && !query.write)
    const syncing = syncSupabase()
    await advance(0)
    await held.entered
    auth$.userId.set('user-b')
    held.release()
    await settle(syncing)
    expect(server.calls.filter((query) => query.table === 'bookmarks' && !query.write)).toHaveLength(1)
    expect(writes()).toEqual([])
    expect(bookmarks$.bookmarks.peek().some((row) => row.id.startsWith('remote-'))).toBe(false)
    expect(syncMeta$.lastError.peek()).toBeUndefined()
  })

  test('a successful paginated pull retains every remote bookmark before reconciling local changes', async () => {
    seedRemoteBookmarks(SYNC_PAGE_SIZE + 1)
    await settle(syncSupabase())
    const pulls = server.calls.filter((query) => query.table === 'bookmarks' && !query.write)
    expect(pulls).toHaveLength(2)
    expect(pulls[1].keyset).toBeDefined()
    const remote = bookmarks$.bookmarks.peek().filter((row) => row.id.startsWith('remote-'))
    expect(remote).toHaveLength(SYNC_PAGE_SIZE + 1)
    expect(new Set(remote.map((row) => row.id)).size).toBe(SYNC_PAGE_SIZE + 1)
    expect(server.tables.bookmarks.find((row) => row.id === 'local')?.title).toBe('Original')
    expect(syncMeta$.pendingBookmarkIds.peek()).toEqual([])
  })
})
