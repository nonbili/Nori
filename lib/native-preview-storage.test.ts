import { describe, expect, it } from 'bun:test'
import { createNativePreviewStorage } from './native-preview-storage'
import { previewKey } from './bookmark-preview-types'

function fileSystem() {
  const files = new Map<string, string>()
  const calls = { directory: 0, records: 0 }
  const fs = {
    EncodingType: { Base64: 'base64' },
    makeDirectoryAsync: async () => {},
    readAsStringAsync: async (uri: string) => {
      if (uri.endsWith('.json')) calls.records++
      if (!files.has(uri)) throw new Error('missing file')
      return files.get(uri)!
    },
    writeAsStringAsync: async (uri: string, value: string) => {
      files.set(uri, value)
    },
    deleteAsync: async (uri: string) => {
      files.delete(uri)
    },
    copyAsync: async ({ from, to }: { from: string; to: string }) => {
      files.set(to, files.get(from)!)
    },
    readDirectoryAsync: async (directory: string) => {
      calls.directory++
      return [...files.keys()].filter((uri) => uri.startsWith(directory)).map((uri) => uri.slice(directory.length))
    },
    getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }),
  } as unknown as Parameters<typeof createNativePreviewStorage>[0]
  return { fs, files, calls }
}
const preview = {
  description: 'Article',
  imageUrl: 'https://example.com/image.jpg',
  imageUri: 'data:image/jpeg;base64,aW1hZ2U=',
  savedAt: 1,
}

describe('native preview storage', () => {
  it('does no filesystem scans while URLs are typed and reads only removed cached keys', async () => {
    const { fs, calls } = fileSystem()
    const storage = createNativePreviewStorage(fs, 'file:///Documents/bookmark-previews/')
    const keys = new Set<string>()
    for (let index = 0; index < 150; index++) {
      const key = previewKey(`https://saved.example/${index}`, 'screenshot')
      keys.add(key)
      await storage.writePreview(key, preview)
    }
    await storage.prunePreviews(keys)
    calls.directory = calls.records = 0
    for (let length = 1; length <= 20; length++) {
      await storage.prunePreviews(
        new Set([...keys, previewKey(`https://editing.example/${'a'.repeat(length)}`, 'screenshot')]),
      )
    }
    expect(calls.directory).toBe(0)
    expect(calls.records).toBe(0)
    keys.delete(previewKey('https://saved.example/10', 'screenshot'))
    await storage.prunePreviews(keys)
    expect(calls.directory).toBe(0)
    expect(calls.records).toBe(1)
  })
  it('retains a screenshot through delete/Undo and removes it only after the tombstone is purged', async () => {
    const { fs, files } = fileSystem()
    const storage = createNativePreviewStorage(fs, 'file:///Documents/bookmark-previews/')
    const row = { url: 'https://undo.example', json: { deleted_at: null as string | null } }
    const key = previewKey(row.url, 'screenshot')
    const keysForRows = (rows: (typeof row)[]) => new Set(rows.map((row) => previewKey(row.url, 'screenshot')))
    await storage.prunePreviews(keysForRows([row]))
    await storage.writePreview(key, preview)
    const screenshot = await storage.readPreview(key)
    row.json.deleted_at = new Date().toISOString()
    await storage.prunePreviews(keysForRows([row]))
    expect(await storage.readPreview(key)).toEqual(screenshot)
    row.json.deleted_at = null
    await storage.prunePreviews(keysForRows([row]))
    expect(await storage.readPreview(key)).toEqual(screenshot)
    await storage.prunePreviews(keysForRows([]))
    expect(await storage.readPreview(key)).toBeUndefined()
    expect(files.has(screenshot!.imageUri)).toBe(false)
  })
  it('persists relative file names and resolves them after an iOS container move', async () => {
    const { fs, files } = fileSystem()
    const before = 'file:///old-container/Documents/bookmark-previews/'
    const after = 'file:///new-container/Documents/bookmark-previews/'
    const key = previewKey('https://example.com', 'screenshot')
    await createNativePreviewStorage(fs, before).writePreview(key, preview)
    const metadata = [...files.values()].find((value) => value.startsWith('{'))!
    expect(metadata).not.toContain('file:')
    for (const [uri, value] of [...files]) {
      files.delete(uri)
      files.set(uri.replace(before, after), value)
    }
    const restored = await createNativePreviewStorage(fs, after).readPreview(key)
    expect(restored?.imageUri).toStartWith(after)
    expect(files.get(restored!.imageUri)).toBe('aW1hZ2U=')
  })
  it('recovers legacy absolute paths rather than discarding screenshots', async () => {
    const { fs, files } = fileSystem()
    const oldDirectory = 'file:///old/Documents/bookmark-previews/'
    const newDirectory = 'file:///new/Documents/bookmark-previews/'
    const key = previewKey('https://legacy.example', 'screenshot')
    const original = createNativePreviewStorage(fs, oldDirectory)
    await original.writePreview(key, preview)
    const saved = await original.readPreview(key)
    const metadataURI = [...files.keys()].find((uri) => uri.endsWith('.json'))!
    files.set(metadataURI, JSON.stringify({ key, preview: saved }))
    for (const [uri, value] of [...files]) {
      files.delete(uri)
      files.set(uri.replace(oldDirectory, newDirectory), value)
    }
    const restored = await createNativePreviewStorage(fs, newDirectory).readPreview(key)
    expect(restored?.imageUri).toStartWith(newDirectory)
    expect(files.get(restored!.imageUri)).toBe('aW1hZ2U=')
    expect(files.get(metadataURI.replace(oldDirectory, newDirectory))).not.toContain(oldDirectory)
  })
  it('removes corrupt records and orphan images without preventing later writes', async () => {
    const { fs, files } = fileSystem()
    const directory = 'file:///Documents/bookmark-previews/'
    files.set(directory + 'broken.json', '{truncated')
    files.set(directory + 'orphan.jpg', 'unused image')
    const storage = createNativePreviewStorage(fs, directory)
    const key = previewKey('https://healthy.example', 'page-image')
    await storage.writePreview(key, preview)
    expect((await storage.readPreview(key))?.description).toBe('Article')
    expect(files.has(directory + 'broken.json')).toBe(false)
    expect(files.has(directory + 'orphan.jpg')).toBe(false)
    files.set(directory + 'later-broken.json', '{')
    await storage.writePreview(previewKey('https://another.example', 'page-image'), preview)
    expect((await storage.readPreview(key))?.imageUri).toBeTruthy()
  })
  it('retains manually captured screenshots across hundreds of automatic writes', async () => {
    const { fs, files } = fileSystem()
    const storage = createNativePreviewStorage(fs, 'file:///Documents/bookmark-previews/')
    const key = previewKey('https://manual.example', 'screenshot')
    await storage.writePreview(key, preview)
    for (let i = 0; i < 150; i++)
      await storage.writePreview(previewKey(`https://automatic.example/${i}`, 'page-image'), {
        ...preview,
        savedAt: i + 2,
      })
    const saved = await storage.readPreview(key)
    expect(saved?.imageUri).toBeTruthy()
    expect(files.has(saved!.imageUri)).toBe(true)
  })
  it('prunes deleted/edited URLs on initialization and keeps both live sources', async () => {
    const { fs, files } = fileSystem()
    const directory = 'file:///Documents/bookmark-previews/'
    const original = createNativePreviewStorage(fs, directory)
    const screenshot = previewKey('https://live.example', 'screenshot')
    const pageImage = previewKey('https://live.example', 'page-image')
    const removed = previewKey('https://deleted.example', 'screenshot')
    for (const key of [screenshot, pageImage, removed]) await original.writePreview(key, preview)
    const removedImage = (await original.readPreview(removed))!.imageUri
    const reopened = createNativePreviewStorage(fs, directory)
    await reopened.prunePreviews(new Set([screenshot, pageImage]))
    expect(await reopened.readPreview(removed)).toBeUndefined()
    expect(files.has(removedImage)).toBe(false)
    expect((await reopened.readPreview(screenshot))?.imageUri).toBeTruthy()
    expect((await reopened.readPreview(pageImage))?.imageUri).toBeTruthy()
    await reopened.prunePreviews(new Set([screenshot]))
    expect(await reopened.readPreview(pageImage)).toBeUndefined()
    await reopened.writePreview(removed, preview)
    expect(await reopened.readPreview(removed)).toBeUndefined()
    expect([...files.keys()].filter((uri) => uri.endsWith('.json'))).toHaveLength(1)
    expect([...files.keys()].filter((uri) => uri.endsWith('.jpg'))).toHaveLength(1)
  })
  it('rewrites only the record when the image is unchanged, keeping the file', async () => {
    const { fs } = fileSystem()
    const storage = createNativePreviewStorage(fs as never, 'file:///previews/')
    const key = previewKey('https://same-image.example/', 'screenshot')
    await storage.writePreview(key, { description: '', imageUrl: '', imageUri: 'data:image/jpeg;base64,c2hvdA==', savedAt: 1 })
    const saved = (await storage.readPreview(key))!
    await storage.writePreview(key, { ...saved, owner: 'user-1' })
    expect(await storage.readPreview(key)).toEqual({ ...saved, owner: 'user-1' })
  })
})

it('gives refreshed media a fresh URI even when the personal save timestamp stays the same', async () => {
  const { fs, files } = fileSystem()
  const storage = createNativePreviewStorage(fs, 'file:///previews/')
  const key = 'social:https://example.com/post:0'
  await storage.writePreview(key, { ...preview, imageUri: 'data:image/jpeg;base64,YQ==' })
  const first = (await storage.readPreview(key))!
  await storage.writePreview(key, { ...preview, imageUri: 'data:image/jpeg;base64,Yg==' })
  const second = (await storage.readPreview(key))!
  expect(second.savedAt).toBe(first.savedAt)
  expect(second.imageUri).not.toBe(first.imageUri)
  expect(files.has(first.imageUri)).toBe(false)
  expect(files.get(second.imageUri)).toBe('Yg==')
})

it('syncs file-backed native SNS media using byte detection even when the stored extension is a fallback', async () => {
  const { syncSocialPosts } = await import('./social-post-sync')
  const { socialKey, socialAssetKey } = await import('./social-post')
  const { readSocialImageFile } = await import('./social-post-image-core')
  const { fs } = fileSystem()
  const storage = createNativePreviewStorage(fs, 'file:///Documents/bookmark-previews/')
  const url = 'https://reddit.com/comments/native'
  const imageKey = socialAssetKey(url, 0)
  const base64 = btoa('\x89PNG\r\n\x1a\nbytes')
  const post = { site: 'reddit', url, author: 'Alice', text: 'Native capture', media: [{ type: 'image' as const, url: 'https://cdn.test/image', cacheKey: imageKey }] }
  await storage.writePreview(imageKey, { description: '', imageUrl: post.media[0].url, imageUri: `data:image/unknown;base64,${base64}`, savedAt: 10, owner: 'alice' })
  await storage.writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt: 10, owner: 'alice', savedPost: { post, savedAt: 10, owner: 'alice' } })
  const cached = await storage.readPreview(imageKey)
  expect(cached?.imageUri).toEndWith('.jpg')
  let uploaded = false
  await syncSocialPosts('alice', [{ id: 'bookmark', url }], {
    ...storage,
    newId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    read: storage.readPreview,
    write: storage.writePreview,
    readImage: (uri) => readSocialImageFile(uri, (path) => fs.readAsStringAsync(path, { encoding: fs.EncodingType.Base64 })),
    store: {
      save: async (_, images) => { expect(images).toEqual([`data:image/png;base64,${base64}`]); uploaded = true },
      get: async () => { throw new Error('must_not_download') },
      image: async () => { throw new Error('must_not_download') },
    },
    setRef: (_, ref) => { expect(uploaded).toBe(true); expect(ref.postId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') },
    isCurrent: () => true,
    changed: () => {},
  })
  expect(uploaded).toBe(true)
})
