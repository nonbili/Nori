import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { observable } from '@legendapp/state'
import { addBookmarkRecord, type BookmarkDraftData } from '../lib/bookmark-mutations'
import type { BookmarkListData, BookmarkRecordData } from '../lib/nori-data'
import type { PendingQuickShareLink } from '../modules/nori-quick-share'
import { deferred } from './support/async'

const lists$ = observable({ lists: [] as BookmarkListData[] })
const settings$ = observable({ quickSaveShareListId: 'target', quickSaveSharedLinks: true })
const ui$ = observable({ revealBookmarkId: null as string | null, pendingShare: null as unknown, pendingBookmarkImport: null as unknown })
const rows = observable([] as BookmarkRecordData[])
let sequence = 0
const add = mock((draft: BookmarkDraftData): string | null => {
  const next = addBookmarkRecord(lists$.lists.peek(), rows.peek(), draft, `bookmark-${++sequence}`, new Date().toISOString())
  if (!next) return null
  rows.set(next.bookmarks)
  return next.id
})
const enrich = mock(async (_id: string) => {})
let inbox: PendingQuickShareLink[] = []
let appInbox: PendingQuickShareLink[] = []
const remove = mock(async (ids: string[]) => { inbox = inbox.filter((entry) => !ids.includes(entry.id)) })
const removeApp = mock(async (ids: string[]) => { appInbox = appInbox.filter((entry) => !ids.includes(entry.id)) })
const configure = mock(async (_enabled: boolean, _listId: string) => {})
const readInbox = mock(async () => structuredClone(inbox))
mock.module('@/states/lists', () => ({ lists$ }))
mock.module('@/states/settings', () => ({ settings$ }))
mock.module('@/states/ui', () => ({ ui$ }))
mock.module('@/states/bookmarks', () => ({ bookmarks$: { add } }))
mock.module('@/lib/saved-bookmark-metadata', () => ({ enrichSavedBookmark: enrich }))
mock.module('@/modules/nori-quick-share', () => ({
  configureQuickShare: configure,
  getPendingQuickShareLinks: readInbox,
  removePendingQuickShareLinkIds: remove,
  getPendingAppShareLinks: async () => structuredClone(appInbox),
  removePendingAppShareLinkIds: removeApp,
}))
const { drainQuickShareInbox, drainAppShareInbox, syncQuickShareNativeConfig } = await import('../lib/quick-share')
const list = (id: string, deleted = false): BookmarkListData => ({
  id, name: id, json: { visible: true, ...(deleted ? { deleted_at: '2026-10-01T00:00:00Z' } : {}) },
  createdAt: '', updatedAt: '',
})
const entry = (id: string, url = `https://${id}.example/`): PendingQuickShareLink => ({
  id, url, targetListId: 'target', createdAt: '2026-10-18T00:00:00Z',
})

beforeEach(() => {
  lists$.lists.set([list('target'), list('fallback')])
  rows.set([])
  settings$.assign({ quickSaveShareListId: 'target', quickSaveSharedLinks: true })
  ui$.assign({ revealBookmarkId: null, pendingShare: null, pendingBookmarkImport: null })
  inbox = []; appInbox = []
  for (const fn of [add, enrich, remove, removeApp, configure, readInbox]) fn.mockClear()
})

describe('quick-share inbox', () => {
  test('acknowledges only successfully saved entries and reveals the last saved bookmark', async () => {
    inbox = [entry('one'), entry('two'), entry('invalid', 'file:///private/data')]
    add.mockImplementationOnce(() => null)
    expect(await drainQuickShareInbox()).toBe(1)
    expect(remove).toHaveBeenCalledWith(['two'])
    expect(inbox.map((item) => item.id)).toEqual(['one', 'invalid'])
    expect(rows.peek()).toHaveLength(1)
    expect(ui$.revealBookmarkId.peek()).toBe(rows.peek()[0].id)
    expect(enrich).toHaveBeenCalledWith(rows.peek()[0].id)
  })

  test('a deleted destination falls back to an available list', async () => {
    lists$.lists.set([list('target', true), list('fallback')])
    inbox = [entry('one')]
    await drainQuickShareInbox()
    expect(rows.peek()[0].listId).toBe('fallback')
    expect(inbox).toEqual([])
  })

  test('retains the inbox when no destination is available', async () => {
    lists$.lists.set([list('target', true)])
    inbox = [entry('one')]
    expect(await drainQuickShareInbox()).toBe(0)
    expect(inbox).toEqual([entry('one')])
    expect(add).not.toHaveBeenCalled()
    expect(enrich).not.toHaveBeenCalled()
  })

  test('a failed acknowledgement can be retried without duplicating the saved bookmark', async () => {
    inbox = [entry('one')]
    remove.mockRejectedValueOnce(new Error('Native inbox unavailable'))
    await expect(drainQuickShareInbox()).rejects.toThrow('Native inbox unavailable')
    expect(inbox).toHaveLength(1)
    expect(rows.peek()).toHaveLength(1)
    const savedId = rows.peek()[0].id
    await drainQuickShareInbox()
    expect(inbox).toEqual([])
    expect(rows.peek()).toHaveLength(1)
    expect(rows.peek()[0].id).toBe(savedId)
  })

  test('overlapping foreground drains and later repeats do not create duplicate bookmarks', async () => {
    inbox = [entry('one')]
    const snapshot = structuredClone(inbox)
    const gate = deferred<PendingQuickShareLink[]>()
    readInbox.mockImplementationOnce(() => gate.promise)
    readInbox.mockImplementationOnce(() => gate.promise)
    const first = drainQuickShareInbox()
    const second = drainQuickShareInbox()
    gate.resolve(snapshot)
    await Promise.all([first, second])
    expect(rows.peek()).toHaveLength(1)
    expect(inbox).toEqual([])
    expect(await drainQuickShareInbox()).toBe(0)
    expect(rows.peek()).toHaveLength(1)
  })

  test('a native read failure does not acknowledge or save anything', async () => {
    inbox = [entry('one')]
    readInbox.mockRejectedValueOnce(new Error('Read failed'))
    await expect(drainQuickShareInbox()).rejects.toThrow('Read failed')
    expect(remove).not.toHaveBeenCalled()
    expect(rows.peek()).toEqual([])
    expect(inbox).toHaveLength(1)
  })

  test('native configuration follows the setting and disables quick save without a valid destination', async () => {
    await syncQuickShareNativeConfig()
    expect(configure).toHaveBeenLastCalledWith(true, 'target')
    settings$.quickSaveSharedLinks.set(false)
    await syncQuickShareNativeConfig()
    expect(configure).toHaveBeenLastCalledWith(false, 'target')
    settings$.quickSaveSharedLinks.set(true)
    lists$.lists.set([])
    await syncQuickShareNativeConfig()
    expect(configure).toHaveBeenLastCalledWith(false, '')
  })
})

describe('app-share inbox', () => {
  test('opens valid links for review and clears unusable entries so later shares can be handled', async () => {
    appInbox = [entry('one'), entry('invalid', 'javascript:alert(1)')]
    ui$.pendingBookmarkImport.set({ content: 'old import' })
    expect(await drainAppShareInbox()).toBe(1)
    expect(ui$.pendingBookmarkImport.peek()).toBeNull()
    expect(ui$.pendingShare.peek()).toMatchObject({ items: [{ url: 'https://one.example/' }] })
    expect(removeApp).toHaveBeenCalledWith(['one', 'invalid'])
    expect(appInbox).toEqual([])
    expect(add).not.toHaveBeenCalled()
  })
})
