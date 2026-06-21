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
  dropExpiredSyncTombstones,
  isPristineStarterSeed,
  mergeSyncRows,
  parseSyncUpdatedAt,
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
