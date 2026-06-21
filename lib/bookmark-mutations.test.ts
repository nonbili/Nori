import { describe, expect, it } from 'bun:test'
import { addBookmarkRecord, getBookmarkUrlKey, resolveActiveListId } from './bookmark-mutations'
import { getTags, isVisible, normalizeBookmarks, normalizeLists, patchRowState } from './nori-data'

describe('bookmark mutations', () => {
  it('adds a bookmark to an active list with a fresh array reference', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [])

    const result = addBookmarkRecord(lists, bookmarks, {
      listId: 'read',
      url: 'example.com',
      title: ' Example ',
      icon: ' https://example.com/icon.ico ',
      tags: ['Docs'],
    }, 'new', '2026-06-21T00:00:00.000Z')

    expect(result).not.toBeNull()
    expect(result!.bookmarks).not.toBe(bookmarks)
    expect(result!.id).toBe('new')
    expect(result!.bookmarks.at(-1)).toMatchObject({
      id: 'new',
      listId: 'read',
      url: 'https://example.com',
      title: 'Example',
      icon: 'https://example.com/icon.ico',
      json: {
        visible: true,
        sort_index: bookmarks.filter((item) => item.listId === 'read').length,
        deleted_at: null,
        tags: ['Docs'],
      },
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    })
  })

  it('rejects blank urls and missing list ids', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [])

    expect(addBookmarkRecord(lists, bookmarks, { listId: 'read', url: '   ' }, 'new', 'now')).toBeNull()
    expect(addBookmarkRecord(lists, bookmarks, { listId: 'missing', url: 'https://example.com' }, 'new', 'now')).toBeNull()
  })

  it('resolves hidden lists as active and deleted lists as inactive', () => {
    const lists = normalizeLists([
      { id: 'hidden', name: 'Hidden', json: { visible: false } },
      { id: 'deleted', name: 'Deleted', json: { visible: true, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])

    expect(resolveActiveListId(lists, 'hidden')).toBe('hidden')
    expect(resolveActiveListId(lists, 'deleted')).toBe('')
  })

  it('returns the existing bookmark without changing the array for visible duplicates', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'existing', listId: 'read', url: 'https://example.com/page', title: 'Existing', icon: '', json: { visible: true } },
    ])

    const result = addBookmarkRecord(lists, bookmarks, {
      listId: 'read',
      url: 'example.com/page',
      title: 'Duplicate',
    }, 'new', '2026-06-21T00:00:00.000Z')

    expect(result).toEqual({ id: 'existing', bookmarks })
  })

  it('reveals hidden duplicates and updates tags', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'existing', listId: 'read', url: 'https://example.com/page', title: 'Existing', icon: '', json: { visible: false } },
    ])

    const result = addBookmarkRecord(lists, bookmarks, {
      listId: 'read',
      url: 'example.com/page',
      tags: ['Later'],
    }, 'new', '2026-06-21T00:00:00.000Z')

    const existing = result!.bookmarks.find((item) => item.id === 'existing')!
    expect(result!.id).toBe('existing')
    expect(result!.bookmarks).not.toBe(bookmarks)
    expect(isVisible(existing)).toBe(true)
    expect(getTags(existing)).toEqual(['Later'])
    expect(existing.updatedAt).toBe('2026-06-21T00:00:00.000Z')
  })

  it('allows adding the same url when the previous bookmark was deleted', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const [deleted] = normalizeBookmarks(lists, [
      { id: 'deleted', listId: 'read', url: 'https://example.com/page', title: 'Deleted', icon: '', json: { visible: true } },
    ]).filter((item) => item.id === 'deleted')
    const bookmarks = [patchRowState(deleted, { deleted_at: '2026-06-21T00:00:00.000Z', visible: false })]

    const result = addBookmarkRecord(lists, bookmarks, {
      listId: 'read',
      url: 'https://example.com/page/',
      title: 'New',
    }, 'new', '2026-06-21T00:00:00.000Z')

    expect(result!.id).toBe('new')
    expect(result!.bookmarks).toHaveLength(2)
  })

  it('normalizes equivalent http urls for duplicate checks', () => {
    expect(getBookmarkUrlKey('example.com/page')).toBe('https://example.com/page')
    expect(getBookmarkUrlKey('https://example.com/page/')).toBe('https://example.com/page/')
  })
})
