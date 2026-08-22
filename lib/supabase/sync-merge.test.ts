import { describe, expect, it } from 'bun:test'
import {
  createRowJsonState,
  createStarterBookmarks,
  createStarterLists,
  normalizeBookmarks,
  normalizeLists,
  patchRowState,
  type BookmarkListData,
} from '@/lib/nori-data'
import {
  collectChangedRowIds,
  collectUnsyncedRowIds,
  dropExpiredSyncTombstones,
  isPristineStarterSeed,
  mergeSyncRows,
  nextSyncCursor,
  parseSyncUpdatedAt,
  SYNC_CURSOR_OVERLAP_MS,
} from './sync-merge'

describe('supabase sync merge helpers', () => {
  it('parses invalid or missing updated_at values as the oldest timestamp', () => {
    expect(parseSyncUpdatedAt()).toBe(0)
    expect(parseSyncUpdatedAt('not a date')).toBe(0)
    expect(parseSyncUpdatedAt('2026-06-21T00:00:00.000Z')).toBe(Date.parse('2026-06-21T00:00:00.000Z'))
  })

  it('merges newer remote rows while preserving pending local rows', () => {
    const local = [
      { id: 'keep-local', value: 'local', updatedAt: '2026-06-21T00:00:00.000Z' },
      { id: 'pending', value: 'local pending', updatedAt: '2026-06-20T00:00:00.000Z' },
    ]
    const remote = [
      { id: 'keep-local', value: 'remote', updatedAt: '2026-06-22T00:00:00.000Z' },
      { id: 'pending', value: 'remote pending', updatedAt: '2026-06-23T00:00:00.000Z' },
      { id: 'remote-only', value: 'remote only', updatedAt: '2026-06-19T00:00:00.000Z' },
    ]

    expect(mergeSyncRows(local, remote, new Set(['pending']))).toEqual([
      { id: 'keep-local', value: 'remote', updatedAt: '2026-06-22T00:00:00.000Z' },
      { id: 'pending', value: 'local pending', updatedAt: '2026-06-20T00:00:00.000Z' },
      { id: 'remote-only', value: 'remote only', updatedAt: '2026-06-19T00:00:00.000Z' },
    ])
  })

  it('keeps newer local rows over older remote rows', () => {
    const local = [{ id: 'row', value: 'local', updatedAt: '2026-06-22T00:00:00.000Z' }]
    const remote = [{ id: 'row', value: 'remote', updatedAt: '2026-06-21T00:00:00.000Z' }]

    expect(mergeSyncRows(local, remote, new Set())).toEqual(local)
  })

  it('drops tombstones only after the retention window', () => {
    const now = Date.parse('2026-06-21T00:00:00.000Z')
    const rows: BookmarkListData[] = [
      {
        id: 'live',
        name: 'Live',
        json: createRowJsonState({ visible: true }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'recent-delete',
        name: 'Recent Delete',
        json: createRowJsonState({ visible: false, deleted_at: '2026-06-01T00:00:00.000Z' }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'old-delete',
        name: 'Old Delete',
        json: createRowJsonState({ visible: false, deleted_at: '2026-01-01T00:00:00.000Z' }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]

    expect(dropExpiredSyncTombstones(rows, now).map((item) => item.id)).toEqual(['live', 'recent-delete'])

    // An expired tombstone that has not been pushed yet is kept, otherwise the
    // next pull would resurrect the row from the server.
    expect(dropExpiredSyncTombstones(rows, now, new Set(['old-delete'])).map((item) => item.id))
      .toEqual(['live', 'recent-delete', 'old-delete'])
  })

  it('collects only the rows whose content changed', () => {
    const previous = [
      { id: 'a', title: 'A', json: { sort_index: 0 } },
      { id: 'b', title: 'B', json: { sort_index: 1 } },
      { id: 'c', title: 'C', json: { sort_index: 2 } },
    ]
    const next = [
      { id: 'c', title: 'C', json: { sort_index: 2 } },
      { id: 'a', title: 'A renamed', json: { sort_index: 0 } },
      { id: 'd', title: 'D', json: { sort_index: 3 } },
    ]

    // 'a' was edited and 'd' is new; 'c' only moved within the array, and 'b'
    // is gone, so neither has anything to push.
    expect(collectChangedRowIds(next, previous)).toEqual(['a', 'd'])
    expect(collectChangedRowIds(previous, previous)).toEqual([])
    expect(collectChangedRowIds(previous, undefined)).toEqual(['a', 'b', 'c'])
  })

  it('advances the pull cursor to just behind the newest row seen', () => {
    const newest = '2026-06-21T00:00:10.000Z'
    const rows = [
      { updatedAt: '2026-06-21T00:00:00.000Z' },
      { updatedAt: newest },
    ]

    expect(nextSyncCursor(rows)).toBe(new Date(Date.parse(newest) - SYNC_CURSOR_OVERLAP_MS).toISOString())

    // Nothing came back, so the cursor stays where it was.
    expect(nextSyncCursor([], '2026-06-21T00:00:00.000Z')).toBe('2026-06-21T00:00:00.000Z')
    expect(nextSyncCursor([])).toBeUndefined()

    // The overlap re-reads rows just past the cursor; that must not walk the
    // cursor backwards a window at a time.
    const cursor = '2026-06-21T00:00:05.000Z'
    expect(nextSyncCursor([{ updatedAt: '2026-06-21T00:00:06.000Z' }], cursor)).toBe(cursor)

    // Each table keeps its own cursor, so a table that rarely changes cannot
    // hold the other one back.
    const listsCursor = nextSyncCursor([{ updatedAt: '2026-01-01T00:00:00.000Z' }])
    const bookmarksCursor = nextSyncCursor([{ updatedAt: '2026-06-21T00:00:00.000Z' }])
    expect(listsCursor).not.toBe(bookmarksCursor)
  })

  it('queues only rows the server is missing or holds an older copy of', () => {
    const local = [
      { id: 'never-pushed', updatedAt: '2026-06-21T00:00:00.000Z' },
      { id: 'local-newer', updatedAt: '2026-06-22T00:00:00.000Z' },
      { id: 'remote-newer', updatedAt: '2026-06-20T00:00:00.000Z' },
      { id: 'same', updatedAt: '2026-06-21T00:00:00.000Z' },
    ]
    const remote = [
      { id: 'local-newer', updatedAt: '2026-06-21T00:00:00.000Z' },
      { id: 'remote-newer', updatedAt: '2026-06-23T00:00:00.000Z' },
      { id: 'same', updatedAt: '2026-06-21T00:00:00.000Z' },
    ]

    // 'remote-newer' is left to timestamp resolution: an upgraded install must
    // not push its stale copy over another device's newer edit.
    expect(collectUnsyncedRowIds(local, remote)).toEqual(['never-pushed', 'local-newer'])
    expect(collectUnsyncedRowIds(local, local)).toEqual([])
  })

  it('detects untouched starter data for initial remote seeding', () => {
    expect(isPristineStarterSeed(createStarterLists(), createStarterBookmarks())).toBe(true)

    const lists = normalizeLists(createStarterLists())
    const bookmarks = normalizeBookmarks(lists, createStarterBookmarks())
    const changedBookmarks = bookmarks.map((item) => (
      item.id === 'builtin-sns-x' ? { ...item, title: 'Changed' } : item
    ))

    expect(isPristineStarterSeed(lists, changedBookmarks)).toBe(false)
  })

  it('does not treat deleted starter data as pristine seed data', () => {
    const lists = normalizeLists(createStarterLists())
    const bookmarks = normalizeBookmarks(lists, createStarterBookmarks())
    const deletedLists = lists.map((item) => (
      item.id === 'builtin-sns'
        ? patchRowState(item, { deleted_at: '2026-06-21T00:00:00.000Z', visible: false })
        : item
    ))

    expect(isPristineStarterSeed(deletedLists, bookmarks)).toBe(false)
  })
})
