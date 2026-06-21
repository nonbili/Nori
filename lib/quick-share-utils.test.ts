import { describe, expect, it } from 'bun:test'
import { normalizeLists } from './nori-data'
import { isValidQuickShareHttpUrl, resolveQuickShareTargetListIdFromLists } from './quick-share-utils'

describe('quick share utils', () => {
  it('accepts only http and https urls', () => {
    expect(isValidQuickShareHttpUrl('https://example.com')).toBe(true)
    expect(isValidQuickShareHttpUrl('http://example.com')).toBe(true)
    expect(isValidQuickShareHttpUrl('ftp://example.com')).toBe(false)
    expect(isValidQuickShareHttpUrl('not a url')).toBe(false)
  })

  it('uses the preferred list when it is visible', () => {
    const lists = normalizeLists([
      { id: 'first', name: 'First', json: { visible: true, sort_index: 0 } },
      { id: 'preferred', name: 'Preferred', json: { visible: true, sort_index: 1 } },
    ])

    expect(resolveQuickShareTargetListIdFromLists(lists, 'preferred')).toBe('preferred')
  })

  it('falls back to the first visible list when the preferred list is hidden or missing', () => {
    const lists = normalizeLists([
      { id: 'first', name: 'First', json: { visible: true, sort_index: 0 } },
      { id: 'hidden', name: 'Hidden', json: { visible: false, sort_index: 1 } },
    ])

    expect(resolveQuickShareTargetListIdFromLists(lists, 'hidden')).toBe('first')
    expect(resolveQuickShareTargetListIdFromLists(lists, 'missing')).toBe('first')
  })

  it('returns an empty target when no lists are visible', () => {
    const lists = normalizeLists([
      { id: 'hidden', name: 'Hidden', json: { visible: false } },
      { id: 'deleted', name: 'Deleted', json: { visible: true, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])

    const withoutStarterLists = lists.map((item) => ({
      ...item,
      json: { ...item.json, visible: false },
    }))

    expect(resolveQuickShareTargetListIdFromLists(withoutStarterLists, '')).toBe('')
  })
})
