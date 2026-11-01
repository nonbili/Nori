import { describe, expect, it } from 'bun:test'
import {
  createScreenshotStore,
  removeOrphanedScreenshots,
  screenshotRef,
  syncScreenshots,
  type ScreenshotBookmark,
  type ScreenshotRef,
  type ScreenshotSyncHost,
} from './screenshot-sync'
import { previewKey, type BookmarkPreview } from './bookmark-preview-types'

const URL_A = 'https://example.com/a'
const KEY_A = previewKey(URL_A, 'screenshot')
const USER = 'user-1'

function preview(savedAt: number, imageUri = 'data:image/jpeg;base64,bG9jYWw='): BookmarkPreview {
  return { description: 'kept', imageUrl: '', imageUri, savedAt }
}

function bookmark(id: string, json: Record<string, unknown> = {}, url = URL_A): ScreenshotBookmark {
  return { id, url, json: { previewSource: 'screenshot', ...json } }
}

function createHost(saved: Record<string, BookmarkPreview> = {}) {
  const uploads: string[] = []
  const refs: { ids: string[]; ref: ScreenshotRef }[] = []
  const changed: string[] = []
  const previews = new Map(Object.entries(saved))
  let nextId = 0
  const host: ScreenshotSyncHost = {
    store: {
      upload: async (path) => void uploads.push(path),
      download: async (path) => `data:image/jpeg;base64,${btoa(path)}`,
      list: async () => [],
      remove: async () => {},
    },
    read: async (key) => previews.get(key),
    write: async (key, value) => void previews.set(key, value),
    shrink: async () => new Uint8Array([1]),
    setRef: (ids, ref) => void refs.push({ ids, ref }),
    changed: (key) => void changed.push(key),
    newId: () => `id${++nextId}`,
  }
  return { host, uploads, refs, changed, previews }
}

describe('syncScreenshots', () => {
  it('uploads a capture that has no pointer yet and points the bookmark at it', async () => {
    const { host, uploads, refs } = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [bookmark('a')], 'page-image', host)
    expect(uploads).toEqual(['user-1/id1.jpg'])
    expect(refs).toEqual([{ ids: ['a'], ref: { path: 'user-1/id1.jpg', savedAt: 100, url: URL_A } }])
  })

  it('downloads a screenshot this device lacks, keeping the text it already read', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    // The tile's automatic load leaves a newer text-only record on a device with no capture.
    const { host, uploads, previews, changed } = createHost({ [KEY_A]: preview(500, '') })
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', host)
    expect(uploads).toEqual([])
    expect(previews.get(KEY_A)).toMatchObject({ description: 'kept', savedAt: 100 })
    expect(previews.get(KEY_A)!.imageUri).toStartWith('data:image/jpeg')
    expect(changed).toEqual([KEY_A])
  })

  it('replaces an older local capture and leaves a newer one to upload', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    const older = createHost({ [KEY_A]: preview(50) })
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', older.host)
    expect(older.previews.get(KEY_A)!.savedAt).toBe(100)
    expect(older.uploads).toEqual([])

    const newer = createHost({ [KEY_A]: preview(200) })
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', newer.host)
    expect(newer.uploads).toHaveLength(1)
    expect(newer.previews.get(KEY_A)!.savedAt).toBe(200)
  })

  it('does nothing once both sides hold the same capture', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    const { host, uploads, refs, changed } = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', host)
    expect([uploads, refs, changed]).toEqual([[], [], []])
  })

  it('ignores a pointer left from before the bookmark moved to another URL', async () => {
    const stale = { path: 'user-1/x.jpg', savedAt: 100, url: 'https://example.com/old' }
    const { host, previews } = createHost()
    await syncScreenshots(USER, [bookmark('a', { screenshot: stale })], 'page-image', host)
    expect(previews.size).toBe(0)
  })

  it('uploads one object for two bookmarks of a page', async () => {
    const { host, uploads, refs } = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [bookmark('a'), bookmark('b')], 'page-image', host)
    expect(uploads).toHaveLength(1)
    expect(refs[0].ids).toEqual(['a', 'b'])
  })

  it('gives a second bookmark of a page the pointer the first one has', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    const { host, uploads, refs } = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref }), bookmark('b')], 'page-image', host)
    expect(uploads).toEqual([])
    expect(refs).toEqual([{ ids: ['b'], ref }])
  })

  it('follows the default source and skips what is not shown as a screenshot', async () => {
    const plain = { id: 'a', url: URL_A, json: {} }
    const off = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [plain], 'page-image', off.host)
    expect(off.uploads).toEqual([])

    const on = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [plain], 'screenshot', on.host)
    expect(on.uploads).toHaveLength(1)

    const tombstone = createHost({ [KEY_A]: preview(100) })
    await syncScreenshots(USER, [bookmark('a', { deleted_at: '2026-01-01T00:00:00.000Z' })], 'page-image', tombstone.host)
    expect(tombstone.uploads).toEqual([])
  })

  it('sets no pointer when the upload failed, and moves on to the next page', async () => {
    const urlB = 'https://example.com/b'
    const { host, refs } = createHost({ [KEY_A]: preview(100), [previewKey(urlB, 'screenshot')]: preview(100) })
    host.store.upload = async (path) => {
      if (path.endsWith('id1.jpg')) throw new Error('offline')
    }
    await syncScreenshots(USER, [bookmark('a'), bookmark('b', {}, urlB)], 'page-image', host)
    expect(refs.map(({ ids }) => ids)).toEqual([['b']])
  })

  it('keeps a capture saved while a download was in flight', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    const { host, previews, changed } = createHost({ [KEY_A]: preview(50) })
    host.store.download = async () => {
      previews.set(KEY_A, preview(300, 'data:image/jpeg;base64,bmV3'))
      return 'data:image/jpeg;base64,cmVtb3Rl'
    }
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', host)
    expect(previews.get(KEY_A)).toMatchObject({ savedAt: 300, imageUri: 'data:image/jpeg;base64,bmV3' })
    expect(changed).toEqual([])
  })

  it('keeps the local capture when a download fails', async () => {
    const ref = { path: 'user-1/x.jpg', savedAt: 100, url: URL_A }
    const { host, previews } = createHost({ [KEY_A]: preview(50) })
    host.store.download = async () => {
      throw new Error('offline')
    }
    await syncScreenshots(USER, [bookmark('a', { screenshot: ref })], 'page-image', host)
    expect(previews.get(KEY_A)!.savedAt).toBe(50)
  })
})

describe('screenshotRef', () => {
  it('rejects malformed values', () => {
    expect(screenshotRef(bookmark('a', { screenshot: { path: 1, savedAt: 1, url: URL_A } }))).toBeUndefined()
    expect(screenshotRef(bookmark('a', { screenshot: { path: 'p', url: URL_A } }))).toBeUndefined()
    expect(screenshotRef({ id: 'a', url: URL_A, json: null })).toBeUndefined()
  })
})

describe('removeOrphanedScreenshots', () => {
  const NOW = 100 * 24 * 60 * 60 * 1000
  const OLD = NOW - 8 * 24 * 60 * 60 * 1000

  function store(objects: { path: string; createdAt: number }[]) {
    const removed: string[][] = []
    return {
      removed,
      store: {
        upload: async () => {},
        download: async () => '',
        list: async () => objects,
        remove: async (paths: string[]) => void removed.push(paths),
      },
    }
  }

  it('removes only old objects that nothing points at', async () => {
    const { store: bucket, removed } = store([
      { path: 'u/orphan.jpg', createdAt: OLD },
      { path: 'u/used.jpg', createdAt: OLD },
      { path: 'u/moved.jpg', createdAt: OLD },
      { path: 'u/trashed.jpg', createdAt: OLD },
      { path: 'u/recent.jpg', createdAt: NOW - 1000 },
    ])
    await removeOrphanedScreenshots(
      'u',
      [
        bookmark('a', { screenshot: { path: 'u/used.jpg', savedAt: 1, url: URL_A } }),
        // Editing the URL back restores this pointer, so it still counts as used.
        bookmark('b', { screenshot: { path: 'u/moved.jpg', savedAt: 1, url: 'https://example.com/old' } }),
        bookmark('c', {
          deleted_at: '2026-01-01T00:00:00.000Z',
          screenshot: { path: 'u/trashed.jpg', savedAt: 1, url: URL_A },
        }),
      ],
      bucket,
      NOW,
    )
    expect(removed).toEqual([['u/orphan.jpg']])
  })
})

describe('createScreenshotStore', () => {
  it('reads past a full page and never guesses that an undated object is old', async () => {
    const pages = [Array.from({ length: 1000 }, (_, index) => ({ name: `${index}.jpg`, created_at: '2026-01-01T00:00:00Z' })), [{ name: 'last.jpg', created_at: null }]]
    const offsets: number[] = []
    const store = createScreenshotStore(
      {
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
        list: async (_folder, { offset }) => {
          offsets.push(offset)
          return { data: pages[offset / 1000], error: null }
        },
        remove: async () => ({ error: null }),
      },
      async () => '',
    )
    const objects = await store.list('u')
    expect(offsets).toEqual([0, 1000])
    expect(objects).toHaveLength(1001)
    expect(objects[1000].path).toBe('u/last.jpg')
    expect(objects[1000].createdAt).toBeGreaterThan(Date.parse('2026-06-01'))
  })
})
