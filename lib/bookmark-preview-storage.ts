import type { BookmarkPreview } from './bookmark-preview-types'

// Keep previews for live bookmark URLs, including both selectable image sources.
// Separate from bookmark data: image bytes never enter sync or bookmark exports.
let liveKeys: ReadonlySet<string> | undefined
let database: Promise<IDBDatabase> | undefined
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('nori-previews', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('previews')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      database = undefined
      reject(request.error)
    }
  })
  return database
}
export async function readPreview(key: string): Promise<BookmarkPreview | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = db.transaction('previews').objectStore('previews').get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function writePreview(key: string, preview: BookmarkPreview) {
  const db = await open()
  if (liveKeys && !liveKeys.has(key)) return
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('previews', 'readwrite')
    const store = transaction.objectStore('previews')
    store.put(preview, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function prunePreviews(keys: ReadonlySet<string>) {
  liveKeys = keys
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('previews', 'readwrite')
    const request = transaction.objectStore('previews').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (!keys.has(String(cursor.key))) cursor.delete()
      cursor.continue()
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
