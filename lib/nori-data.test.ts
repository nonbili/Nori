import { describe, expect, it } from 'bun:test'
import {
  createStarterBookmarks,
  createStarterLists,
  getAvailableBookmarks,
  getDeletedAt,
  getVisibleBookmarks,
  getVisibleLists,
  normalizeBookmarks,
  normalizeLists,
  patchRowState,
} from './nori-data'

describe('starter rows', () => {
  it('creates starter rows once without special-case kind fields', () => {
    const lists = createStarterLists()
    const bookmarks = createStarterBookmarks()

    expect(lists.some((item) => item.id === 'builtin-sns')).toBe(true)
    expect(bookmarks.some((item) => item.id === 'builtin-sns-x')).toBe(true)
    expect('kind' in lists[0]).toBe(false)
    expect('kind' in bookmarks[0]).toBe(false)
  })
})

describe('normalizeLists', () => {
  it('normalizes json row state', () => {
    const lists = normalizeLists([
      { id: 'custom', name: 'Custom', json: { visible: true, sort_index: 4 } },
    ])

    expect(lists[0]?.json.visible).toBe(true)
    expect(lists[0]?.json.sort_index).toBe(0)
  })

  it('filters deleted rows from visible lists', () => {
    const lists = normalizeLists([
      { id: 'custom', name: 'Custom', json: { visible: true, deleted_at: '2026-04-09T00:00:00.000Z' } },
      { id: 'other', name: 'Other', json: { visible: true } },
    ])

    const visibleIds = getVisibleLists(lists).map((item) => item.id)
    expect(visibleIds).toContain('other')
    expect(visibleIds).toContain('builtin-sns')
    expect(visibleIds).not.toContain('custom')
  })

  it('hydrates lists from object-backed persisted array snapshots', () => {
    const lists = normalizeLists({
      0: { id: 'builtin-sns', name: 'SNS', json: { visible: true, sort_index: 0 } },
      1: { id: 'custom', name: 'Custom', json: { visible: true, sort_index: 1 } },
    } as never)

    const ids = lists.map((item) => item.id)
    expect(ids).toContain('builtin-sns')
    expect(ids).toContain('custom')
    expect(ids).toContain('builtin-ai')
  })
})

describe('normalizeBookmarks', () => {
  it('returns only starter bookmarks for malformed bookmark storage payloads', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, { bogus: true } as never)

    expect(bookmarks.length).toBeGreaterThan(0)
    expect(bookmarks.every(b => b.id.startsWith('builtin-'))).toBe(true)
  })

  it('hydrates bookmarks from object-backed persisted array snapshots', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, {
      0: { id: 'a', listId: 'custom', url: 'https://a.com', title: 'A', json: { sort_index: 0 } },
      1: { id: 'b', listId: 'custom', url: 'https://b.com', title: 'B', json: { sort_index: 1 } },
    } as never)

    const ids = bookmarks.map((item) => item.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('builtin-sns-x')
  })

  it('keeps bookmark ordering in json.sort_index', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'b', listId: 'custom', url: 'https://b.com', title: 'B', json: { sort_index: 5 } },
      { id: 'a', listId: 'custom', url: 'https://a.com', title: 'A', json: { sort_index: 0 } },
    ])

    expect(getVisibleBookmarks(bookmarks, 'custom').map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('treats hidden bookmarks as available, not deleted', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'a', listId: 'custom', url: 'https://a.com', title: 'A', json: { visible: false } },
    ])

    expect(getVisibleBookmarks(bookmarks, 'custom')).toHaveLength(0)
    expect(getAvailableBookmarks(bookmarks, 'custom').map((item) => item.id)).toEqual(['a'])
  })

  it('stores deletions in json.deleted_at', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const [bookmark] = normalizeBookmarks(lists, [
      { id: 'a', listId: 'custom', url: 'https://a.com', title: 'A', json: { visible: true } },
    ])
    const deleted = patchRowState(bookmark, { deleted_at: '2026-04-09T00:00:00.000Z' })

    expect(getDeletedAt(deleted)).toBe('2026-04-09T00:00:00.000Z')
  })

  // Legend State's persist layer revives ISO-8601 strings to Date on load.
  it('treats a Date in json.deleted_at as deleted (persist round-trip)', () => {
    const lists = normalizeLists([{ id: 'custom', name: 'Custom', json: { visible: true } }])
    const date = new Date('2026-04-09T00:00:00.000Z')
    const bookmarks = normalizeBookmarks(lists, [
      {
        id: 'a',
        listId: 'custom',
        url: 'https://a.com',
        title: 'A',
        json: { visible: false, deleted_at: date as unknown as string },
      },
    ])

    expect(getDeletedAt(bookmarks[0])).toBe('2026-04-09T00:00:00.000Z')
    expect(getVisibleBookmarks(bookmarks, 'custom')).toHaveLength(0)
    expect(getAvailableBookmarks(bookmarks, 'custom')).toHaveLength(0)
  })
})
