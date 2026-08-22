import { describe, expect, it } from 'bun:test'
import { collectPagedRows, keysetFilter } from './sync-paging'

const row = (id: string, updatedAt: string) => ({ id, updated_at: updatedAt })

describe('supabase sync paging', () => {
  it('walks pages by keyset until a short page ends the scan', async () => {
    const pages = [
      [row('a', '2026-06-21T00:00:00.000Z'), row('b', '2026-06-21T00:00:01.000Z')],
      [row('c', '2026-06-21T00:00:02.000Z'), row('d', '2026-06-21T00:00:03.000Z')],
      [row('e', '2026-06-21T00:00:04.000Z')],
    ]
    const requested: (string | undefined)[] = []

    const rows = await collectPagedRows(async (keyset) => {
      requested.push(keyset?.id)
      return pages[requested.length - 1]
    }, 2)

    expect(rows.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    // Each page resumes from the last row of the one before it.
    expect(requested).toEqual([undefined, 'b', 'd'])
  })

  it('asks for one more page when the last one was exactly full', async () => {
    const pages = [[row('a', '2026-06-21T00:00:00.000Z')], []]
    let calls = 0

    const rows = await collectPagedRows(async () => pages[calls++], 1)

    expect(rows.map((item) => item.id)).toEqual(['a'])
    expect(calls).toBe(2)
  })

  it('resumes strictly after the last row, including its timestamp ties', async () => {
    expect(keysetFilter({ updatedAt: '2026-06-21T00:00:00+00:00', id: 'abc123' })).toBe(
      'updated_at.gt."2026-06-21T00:00:00+00:00",and(updated_at.eq."2026-06-21T00:00:00+00:00",id.gt."abc123")',
    )
  })

  it('propagates a failed page instead of returning a partial scan', async () => {
    const failing = collectPagedRows(async () => {
      throw new Error('network')
    }, 2)

    await expect(failing).rejects.toThrow('network')
  })
})
