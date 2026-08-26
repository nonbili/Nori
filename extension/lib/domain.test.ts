import { beforeAll, describe, expect, it } from 'bun:test'
import {
  createProfile,
  liveBookmarks,
  mergeRows,
  normalizeUrl,
  reorder,
  resolveBookmarkMetadata,
  saveBookmark,
  tombstone,
} from './domain'

beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'generated-id' } })
  }
})

describe('extension domain adapter', () => {
  it('uses the mobile URL and starter-data behavior', () => {
    const profile = createProfile()
    expect(profile.lists.some((list) => list.id === 'builtin-later')).toBe(true)
    expect(profile.bookmarks.some((bookmark) => bookmark.id === 'builtin-ai-chatgpt')).toBe(true)
    expect(normalizeUrl('example.com')).toBe('https://example.com/')
    expect(normalizeUrl('javascript:alert(1)')).toBe('')
  })

  it('uses the shared duplicate-save mutation', () => {
    const profile = createProfile()
    const draft = { listId: 'builtin-later', url: 'https://example.com', title: 'Example', tags: ['read'] }
    const first = saveBookmark(profile, draft)
    const second = saveBookmark(profile, draft)
    expect(second).toBe(first)
    expect(profile.bookmarks.filter((row) => row.id === first)).toHaveLength(1)
    expect(profile.pendingBookmarkIds).toContain(first)
  })

  it('resolves page metadata when the bookmark title is empty', async () => {
    const result = await resolveBookmarkMetadata('example.com/page', '  ', '', async (url) => {
      expect(url).toBe('https://example.com/page')
      return { title: 'Example page', icon: 'https://example.com/icon.png' }
    })

    expect(result).toEqual({ title: 'Example page', icon: 'https://example.com/icon.png' })
  })

  it('preserves an explicit title without fetching metadata', async () => {
    let calls = 0
    const result = await resolveBookmarkMetadata('example.com', ' Custom title ', ' custom.ico ', async () => {
      calls += 1
      return { title: 'Fetched title', icon: 'fetched.ico' }
    })

    expect(result).toEqual({ title: 'Custom title', icon: 'custom.ico' })
    expect(calls).toBe(0)
  })

  it('protects pending local rows during shared timestamp merges', () => {
    const local = [{ id: 'one', updatedAt: '2026-01-01T00:00:00.000Z', value: 'local' }]
    const remote = [{ id: 'one', updatedAt: '2026-02-01T00:00:00.000Z', value: 'remote' }]
    expect(mergeRows(local, remote, ['one'])[0].value).toBe('local')
    expect(mergeRows(local, remote, [])[0].value).toBe('remote')
  })

  it('uses tombstones rather than removing rows', () => {
    const profile = createProfile()
    const id = saveBookmark(profile, { listId: 'builtin-later', url: 'https://example.org' })
    tombstone(profile.bookmarks, profile.pendingBookmarkIds, id)
    expect(profile.bookmarks.find((row) => row.id === id)?.json.deleted_at).toBeTruthy()
    expect(liveBookmarks(profile).some((row) => row.id === id)).toBe(false)
  })

  it('reorders rows and preserves missing rows with consistent sort index', () => {
    const rows = [
      { id: 'a', json: { sort_index: 0 }, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', json: { sort_index: 1 }, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c', json: { sort_index: 2 }, updatedAt: '2026-01-01T00:00:00.000Z' },
    ]
    const pending: string[] = []
    reorder(rows, ['c', 'a'], pending)
    expect(rows.find((r) => r.id === 'c')?.json.sort_index).toBe(0)
    expect(rows.find((r) => r.id === 'a')?.json.sort_index).toBe(1)
    expect(rows.find((r) => r.id === 'b')?.json.sort_index).toBe(2)
    expect(pending).toContain('c')
    expect(pending).toContain('a')
    expect(pending).toContain('b')
  })
})
