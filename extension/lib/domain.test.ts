import { describe, expect, it } from 'bun:test'
import { createProfile, mergeRows } from './domain'

describe('extension domain adapter', () => {
  it('uses the shared starter data', () => {
    const profile = createProfile()
    expect(profile.lists.some((list) => list.id === 'builtin-later')).toBe(true)
    expect(profile.bookmarks.some((bookmark) => bookmark.id === 'builtin-ai-chatgpt')).toBe(true)
  })

  it('protects pending local rows during shared timestamp merges', () => {
    const local = [{ id: 'one', updatedAt: '2026-01-01T00:00:00.000Z', value: 'local' }]
    const remote = [{ id: 'one', updatedAt: '2026-02-01T00:00:00.000Z', value: 'remote' }]
    expect(mergeRows(local, remote, ['one'])[0].value).toBe('local')
    expect(mergeRows(local, remote, [])[0].value).toBe('remote')
  })
})
