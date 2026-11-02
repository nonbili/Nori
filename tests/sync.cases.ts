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
const syncOwner$ = observable({ ownerUserId: undefined as string | undefined, switchBackup: undefined as { fromUserId?: string; savedAt: number; json: string } | undefined })
mock.module('@/states/sync-owner', () => ({ syncOwner$ }))
mock.module('@/lib/supabase/client', () => ({ supabase: server }))
const forgetScreenshots = mock(async (_urls: string[]) => {})
const adoptScreenshots = mock(async (_urls: string[], _owner: string) => {})
mock.module('@/lib/bookmark-preview', () => ({ forgetScreenshots, adoptScreenshots, setScreenshotCaptured: () => {}, setScreenshotOwner: () => {} }))
const runScreenshotSync = mock(async () => {})
const removeOrphans = mock(async () => {})
mock.module('@/lib/supabase/screenshots', () => ({ runScreenshotSync, removeOrphans }))
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
  syncOwner$.set({ ownerUserId: undefined, switchBackup: undefined })
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

  test('a new device signing in keeps the account\'s built-in rows, on the first pull and later full pulls', async () => {
    const older = '2026-10-17T00:00:00.000Z'
    const stamps = { user_id: 'user-a', created_at: older, updated_at: older }
    server.tables.lists = createStarterLists().map((row) => ({
      ...stamps, id: row.id, json: row.json, name: row.id === 'builtin-later' ? 'Read later' : row.name,
    }))
    const deleted = { visible: false, deleted_at: '2026-08-16T00:00:00.000Z' }
    server.tables.bookmarks = [
      ...createStarterBookmarks().map((row) => ({
        ...stamps, id: row.id, list_id: row.listId, url: row.url, title: row.title, icon: row.icon,
        json: row.id === 'builtin-sns-tiktok' ? { ...row.json, ...deleted } : row.json,
      })),
      { ...stamps, id: 'account-row', list_id: 'builtin-later', url: 'https://account.example/', title: 'Account', icon: '', json: {} },
    ]
    bookmarks$.bookmarks.set(createStarterBookmarks())
    syncMeta$.assign({ pendingListIds: [], pendingBookmarkIds: [] })
    const expectAccountKept = () => {
      expect(lists$.lists.peek().find((row) => row.id === 'builtin-later')?.name).toBe('Read later')
      expect(bookmarks$.bookmarks.peek().find((row) => row.id === 'builtin-sns-tiktok')?.json.deleted_at).toBe(deleted.deleted_at)
      expect(syncMeta$.pendingListIds.peek()).toEqual([])
      expect(syncMeta$.pendingBookmarkIds.peek()).toEqual([])
      expect(writes()).toEqual([])
    }

    await settle(syncSupabase())
    expectAccountKept()

    // The device now holds more than the seed, so the full pull's repair pass runs too.
    syncMeta$.lastFullPullAt.set(0)
    await settle(syncSupabase())
    expectAccountKept()
  })

  test('a successful cycle syncs screenshots, and only a full pull looks for orphans', async () => {
    runScreenshotSync.mockClear()
    removeOrphans.mockClear()
    await settle(syncSupabase())
    expect(runScreenshotSync).toHaveBeenCalledTimes(1)
    expect(removeOrphans).toHaveBeenCalledTimes(1)
    // Cursors from an earlier pull make the next cycle incremental.
    const cursor = '2026-10-17T00:00:00.000Z'
    syncMeta$.assign({ syncListsCursor: cursor, syncBookmarksCursor: cursor, lastFullPullAt: Date.now() })
    await settle(syncSupabase())
    expect(runScreenshotSync).toHaveBeenCalledTimes(2)
    expect(removeOrphans).toHaveBeenCalledTimes(1)
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

  test('pauses sync on another account until the user chooses, sending nothing meanwhile', async () => {
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    expect(syncOwner$.ownerUserId.peek()).toBe('user-a')
    server.reset()
    auth$.userId.set('user-b')
    await settle(syncSupabase())
    edit('Edited on the other account')
    await advance(5000)
    expect(server.calls).toEqual([])
    expect(syncOwner$.ownerUserId.peek()).toBe('user-a')
  })

  test('treats data last synced before owners were kept as that account\'s', async () => {
    syncMeta$.assign({ syncUserId: 'user-b' })
    await settle(syncSupabase())
    expect(server.calls).toEqual([])
  })

  test('using the account replaces the device, pushing nothing of the old account', async () => {
    const { resolveAccountChoice } = await import('../lib/supabase/sync-account')
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    server.reset()
    auth$.userId.set('user-b')
    server.tables.bookmarks = [{ id: 'theirs', list_id: 'builtin-later', url: 'https://b.example/', title: 'B', icon: '', json: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', user_id: 'user-b' }]
    await settle(resolveAccountChoice('useAccount'))
    expect(bookmarks$.bookmarks.peek().map((row) => row.id)).toContain('theirs')
    expect(bookmarks$.bookmarks.peek().map((row) => row.id)).not.toContain('local')
    expect(server.tables.bookmarks.map((row) => row.id)).not.toContain('local')
    expect(syncOwner$.ownerUserId.peek()).toBe('user-b')
    expect(syncOwner$.switchBackup.peek()).toMatchObject({ fromUserId: 'user-a' })
    expect(syncOwner$.switchBackup.peek()!.json).toContain('https://local.example/')
    expect(forgetScreenshots.mock.lastCall![0]).toContain('https://local.example/')
  })

  test('merging keeps the account\'s rows, adds the device\'s and pushes only those', async () => {
    const { resolveAccountChoice } = await import('../lib/supabase/sync-account')
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    server.reset()
    auth$.userId.set('user-b')
    server.tables.bookmarks = [{ id: 'theirs', list_id: 'builtin-later', url: 'https://b.example/', title: 'B', icon: '', json: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', user_id: 'user-b' }]
    forgetScreenshots.mockClear()
    await settle(resolveAccountChoice('mergeDevice'))
    // The account has no screenshots here, so every capture goes with the device's bookmarks.
    expect(forgetScreenshots.mock.lastCall![0]).toEqual([])
    expect(adoptScreenshots.mock.lastCall).toEqual([expect.arrayContaining(['https://local.example/']), 'user-b'])
    expect(server.tables.bookmarks.find((row) => row.id === 'local')).toMatchObject({ user_id: 'user-b' })
    expect(server.tables.bookmarks.find((row) => row.id === 'theirs')).toMatchObject({ title: 'B' })
    expect(syncMeta$.pendingBookmarkIds.peek()).toEqual([])
    expect(syncOwner$.ownerUserId.peek()).toBe('user-b')
  })

  test('merging drops a capture only where the account has its own screenshot', async () => {
    const { resolveAccountChoice } = await import('../lib/supabase/sync-account')
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    server.reset()
    auth$.userId.set('user-b')
    const url = 'https://local.example'
    const row = { list_id: 'builtin-inbox', title: 'B', icon: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', user_id: 'user-b' }
    // The same page as the device's bookmark, spelled differently and in another list.
    server.tables.bookmarks = [{ ...row, id: 'shot', url, json: { screenshot: { path: 'user-b/x.jpg', savedAt: 1, url } } }]
    forgetScreenshots.mockClear()
    await settle(resolveAccountChoice('mergeDevice'))
    expect(forgetScreenshots.mock.lastCall![0]).toEqual(['https://local.example/'])

    server.reset()
    syncOwner$.ownerUserId.set('user-a')
    server.tables.bookmarks = [{ ...row, id: 'plain', url, json: {} }]
    forgetScreenshots.mockClear()
    await settle(resolveAccountChoice('mergeDevice'))
    expect(forgetScreenshots.mock.lastCall![0]).toEqual([])
  })

  test('merging keeps an edit made while screenshots were changing hands', async () => {
    const { resolveAccountChoice } = await import('../lib/supabase/sync-account')
    syncMeta$.pendingBookmarkIds.set(['local'])
    await settle(syncSupabase())
    server.reset()
    auth$.userId.set('user-b')
    adoptScreenshots.mockImplementationOnce(async () => edit('Edited during the merge'))
    await settle(resolveAccountChoice('mergeDevice'))
    expect(local().title).toBe('Edited during the merge')
    expect(server.tables.bookmarks.find((row) => row.id === 'local')).toMatchObject({ title: 'Edited during the merge' })
  })

  test('drops an account choice whose account changed and came back while it was reading', async () => {
    const { resolveAccountChoice } = await import('../lib/supabase/sync-account')
    syncOwner$.ownerUserId.set('user-a')
    auth$.userId.set('user-b')
    const held = server.holdNext((query) => query.table === 'bookmarks' && !query.write)
    const choosing = resolveAccountChoice('useAccount')
    await held.entered
    auth$.userId.set('user-a')
    auth$.userId.set('user-b')
    held.release()
    await settle(choosing)
    expect(syncOwner$.ownerUserId.peek()).toBe('user-a')
    expect(local()).toBeDefined()
  })

  test('switching accounts forces a full pull instead of reusing the previous account cursors', async () => {
    syncOwner$.ownerUserId.set('user-a')
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
