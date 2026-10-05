import { describe, expect, it } from 'bun:test'
import { buildHomeWidgetSnapshot, WIDGET_MAX_ITEMS_PER_LIST } from './home-widget'
import { previewRecordFile } from './native-preview-storage'
import { createRowJsonState, type BookmarkListData, type BookmarkRecordData } from './nori-data'

const now = '2026-10-05T00:00:00.000Z'
const options = {
  openInSystemBrowser: false,
  showFavicon: true,
  previewImageSource: 'page-image' as const,
  strings: { chooseList: 'Choose a list', empty: 'No bookmarks yet', viewCompact: 'Compact', viewPreview: 'Preview' },
}

const list = (id: string, sortIndex: number, state = {}): BookmarkListData => ({
  id,
  name: id.toUpperCase(),
  json: createRowJsonState({ sort_index: sortIndex, ...state }),
  createdAt: now,
  updatedAt: now,
})

const bookmark = (id: string, listId: string, sortIndex: number, state = {}, title = id): BookmarkRecordData => ({
  id,
  listId,
  url: `https://${id}.example/page`,
  title,
  icon: `https://${id}.example/favicon.png`,
  json: createRowJsonState({ sort_index: sortIndex, ...state }),
  createdAt: now,
  updatedAt: now,
})

describe('buildHomeWidgetSnapshot', () => {
  it('keeps visible lists and bookmarks in app order', () => {
    const snapshot = buildHomeWidgetSnapshot(
      [list('b', 1), list('a', 0), list('hidden', 2, { visible: false }), list('gone', 3, { deleted_at: now })],
      [
        bookmark('two', 'a', 1),
        bookmark('one', 'a', 0),
        bookmark('hidden', 'a', 2, { visible: false }),
        bookmark('gone', 'a', 3, { deleted_at: now }),
        bookmark('other', 'b', 0),
      ],
      options,
    )

    expect(snapshot.lists.map((item) => item.id)).toEqual(['a', 'b'])
    expect(snapshot.lists[0].name).toBe('A')
    expect(snapshot.lists[0].items).toEqual([
      {
        title: 'one',
        url: 'https://one.example/page',
        icon: 'https://one.example/favicon.png',
        preview: previewRecordFile('page-image:https://one.example/page'),
      },
      {
        title: 'two',
        url: 'https://two.example/page',
        icon: 'https://two.example/favicon.png',
        preview: previewRecordFile('page-image:https://two.example/page'),
      },
    ])
    expect(snapshot.lists[1].items.map((item) => item.title)).toEqual(['other'])
  })

  it('passes options through and falls back to a title from the url', () => {
    const snapshot = buildHomeWidgetSnapshot([list('a', 0)], [bookmark('untitled', 'a', 0, {}, '')], {
      ...options,
      openInSystemBrowser: true,
    })

    expect(snapshot.openInSystemBrowser).toBe(true)
    expect(snapshot.strings.chooseList).toBe('Choose a list')
    expect(snapshot.lists[0].items[0].title).not.toBe('')
  })

  it('points each row at the preview record for its own image source', () => {
    const snapshot = buildHomeWidgetSnapshot(
      [list('a', 0)],
      [bookmark('shot', 'a', 0, { previewSource: 'screenshot' }), bookmark('plain', 'a', 1)],
      options,
    )

    expect(snapshot.lists[0].items.map((item) => item.preview)).toEqual([
      previewRecordFile('screenshot:https://shot.example/page'),
      previewRecordFile('page-image:https://plain.example/page'),
    ])
  })

  it('caps the rows sent per list', () => {
    const many = Array.from({ length: WIDGET_MAX_ITEMS_PER_LIST + 20 }, (_, index) => bookmark(`b${index}`, 'a', index))
    const snapshot = buildHomeWidgetSnapshot([list('a', 0)], many, options)

    expect(snapshot.lists[0].items).toHaveLength(WIDGET_MAX_ITEMS_PER_LIST)
    expect(snapshot.lists[0].items[0].title).toBe('b0')
  })
})
