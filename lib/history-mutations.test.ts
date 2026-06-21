import { describe, expect, it } from 'bun:test'
import { addOpenedBookmarkRecord, removeOpenedBookmarkRecord, type OpenedBookmarkRecord } from './history-mutations'

const opened = (id: string, openedAt: number): OpenedBookmarkRecord => ({
  id,
  url: `https://${id}.example`,
  title: id,
  icon: '',
  openedAt,
})

describe('history mutations', () => {
  it('adds newly opened bookmarks at the front', () => {
    expect(addOpenedBookmarkRecord([opened('old', 1)], {
      id: 'new',
      url: 'https://new.example',
      title: 'New',
      icon: '',
    }, 2)).toEqual([
      { id: 'new', url: 'https://new.example', title: 'New', icon: '', openedAt: 2 },
      opened('old', 1),
    ])
  })

  it('dedupes reopened bookmarks and refreshes openedAt', () => {
    expect(addOpenedBookmarkRecord([opened('a', 1), opened('b', 2)], {
      id: 'b',
      url: 'https://b.example',
      title: 'B',
      icon: 'icon',
    }, 3)).toEqual([
      { id: 'b', url: 'https://b.example', title: 'B', icon: 'icon', openedAt: 3 },
      opened('a', 1),
    ])
  })

  it('caps opened bookmark history at ten rows', () => {
    const current = Array.from({ length: 10 }, (_, index) => opened(`old-${index}`, index))
    const next = addOpenedBookmarkRecord(current, {
      id: 'new',
      url: 'https://new.example',
      title: 'New',
      icon: '',
    }, 99)

    expect(next).toHaveLength(10)
    expect(next[0].id).toBe('new')
    expect(next.map((item) => item.id)).not.toContain('old-9')
  })

  it('removes opened bookmarks by id', () => {
    expect(removeOpenedBookmarkRecord([opened('a', 1), opened('b', 2)], 'a')).toEqual([opened('b', 2)])
  })
})
