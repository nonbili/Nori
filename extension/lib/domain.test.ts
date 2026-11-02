import { describe, expect, it } from 'bun:test'
import { collectUnsyncedRowIds } from 'nori/lib/supabase/sync-merge'
import { createProfile, mergeRows } from './domain'

describe('extension domain adapter', () => {
  it('uses the shared starter data', () => {
    const profile = createProfile()
    expect(profile.lists.some((list) => list.id === 'builtin-later')).toBe(true)
    expect(profile.bookmarks.some((bookmark) => bookmark.id === 'builtin-ai-chatgpt')).toBe(true)
  })

  it('lets the account win over a new profile\'s starter rows, and queues none of them', () => {
    const profile = createProfile('user', 'user@example.com')
    const updatedAt = '2026-10-17T00:00:00.000+00:00'
    const remote = profile.bookmarks.map((row) => (
      row.id === 'builtin-sns-tiktok'
        ? { ...row, updatedAt, json: { ...row.json, visible: false, deleted_at: '2026-08-16T00:00:00.000Z' } }
        : { ...row, updatedAt }
    ))
    const merged = mergeRows(profile.bookmarks, remote, [])
    expect(merged.find((row) => row.id === 'builtin-sns-tiktok')?.json.deleted_at).toBe('2026-08-16T00:00:00.000Z')
    expect(collectUnsyncedRowIds(merged, remote)).toEqual([])
  })

  it('protects pending local rows during shared timestamp merges', () => {
    const local = [{ id: 'one', updatedAt: '2026-01-01T00:00:00.000Z', value: 'local' }]
    const remote = [{ id: 'one', updatedAt: '2026-02-01T00:00:00.000Z', value: 'remote' }]
    expect(mergeRows(local, remote, ['one'])[0].value).toBe('local')
    expect(mergeRows(local, remote, [])[0].value).toBe('remote')
  })
})
