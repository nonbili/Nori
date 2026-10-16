// Recording-only entry point. The normal app entry remains expo-router/entry.
// Use only on the dedicated Nori Preview simulators: this seeds local demo data
// before the regular app starts, without replacing any UI or interaction code.
import 'react-native-get-random-values'
import { createMMKV } from 'react-native-mmkv'
import fixture from '../fastlane/videos/assets/native-preview-fixture.json'
import { STARTER_LISTS, STARTER_BOOKMARKS } from '../lib/nori-data'

if (process.env.EXPO_PUBLIC_APP_PREVIEW !== '1') {
  throw new Error('This recording-only entry requires EXPO_PUBLIC_APP_PREVIEW=1')
}

const storage = createMMKV({ id: 'obsPersist' })
const marker = 'native-preview-fixture-v2'
if (!storage.getBoolean(marker)) {
  const now = new Date().toISOString()
  storage.set('lists', JSON.stringify({
    lists: [...fixture.lists.map((list, index) => ({
      ...list, createdAt: now, updatedAt: now,
      json: { visible: true, sort_index: index, deleted_at: null },
    })), ...STARTER_LISTS.map(list => ({
      ...list, createdAt: now, updatedAt: now,
      json: { visible: false, sort_index: 0, deleted_at: now },
    }))],
  }))
  storage.set('bookmarks', JSON.stringify([...fixture.bookmarks.map((bookmark, index) => ({
    id: `preview-bookmark-${index}`,
    listId: `preview-${bookmark.list}`,
    url: bookmark.url,
    title: bookmark.title,
    icon: `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=64`,
    createdAt: now, updatedAt: now,
    json: { visible: true, sort_index: index, deleted_at: null, tags: bookmark.tags, note: bookmark.note },
  })), ...STARTER_BOOKMARKS.map(bookmark => ({
    ...bookmark, createdAt: now, updatedAt: now,
    json: { visible: false, sort_index: 0, deleted_at: now },
  }))]))
  storage.set('settings', JSON.stringify({
    theme: 'dark', accent: 'emerald', language: 'en',
    fontScale: 1, fontFamily: 'system', bookmarkView: 'preview',
    bookmarkColumns: 1, previewImageSource: 'page-image',
    lastSelectedListId: 'preview-work', showFavicon: true,
  }))
  storage.set(marker, true)
}

require('expo-router/entry')
