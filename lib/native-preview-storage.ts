import type { BookmarkPreview } from './bookmark-preview-types'

type PreviewFileSystem = Pick<
  typeof import('expo-file-system/legacy'),
  | 'readAsStringAsync'
  | 'writeAsStringAsync'
  | 'makeDirectoryAsync'
  | 'copyAsync'
  | 'deleteAsync'
  | 'readDirectoryAsync'
  | 'getInfoAsync'
  | 'EncodingType'
>

interface StoredPreview {
  key: string
  preview: Omit<BookmarkPreview, 'imageUri'> & { imageUri?: string }
  imageFile?: string
}

/** Name of the record file for a preview key, relative to the storage directory. */
export function previewRecordFile(key: string) {
  return `${fileName(key)}.json`
}

function fileName(key: string) {
  let first = 2166136261,
    second = 5381
  for (let i = 0; i < key.length; i++) {
    first = Math.imul(first ^ key.charCodeAt(i), 16777619)
    second = Math.imul(second, 33) ^ key.charCodeAt(i)
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`
}

export function createNativePreviewStorage(fs: PreviewFileSystem, directory: string) {
  let initialization: Promise<void> | undefined
  let liveKeys: ReadonlySet<string> | undefined
  const storedKeys = new Set<string>()

  function imageFile(record: StoredPreview) {
    // Migrate absolute URIs written by the first version. The file itself moves
    // with Documents when iOS assigns the app a new container directory.
    const value = record.imageFile ?? record.preview.imageUri?.split('/').pop() ?? ''
    if (value && !/^[a-zA-Z0-9.-]+$/.test(value)) throw new Error('invalid_preview_file')
    return value
  }

  async function readRecord(uri: string): Promise<StoredPreview | undefined> {
    try {
      const record = JSON.parse(await fs.readAsStringAsync(uri)) as StoredPreview
      if (
        typeof record.key !== 'string' ||
        typeof record.preview?.description !== 'string' ||
        typeof record.preview.imageUrl !== 'string' ||
        !Number.isFinite(record.preview.savedAt)
      ) {
        throw new Error('invalid_preview_record')
      }
      imageFile(record)
      return record
    } catch {
      await fs.deleteAsync(uri, { idempotent: true })
      return undefined
    }
  }

  async function initialize() {
    initialization ??= (async () => {
      await fs.makeDirectoryAsync(directory, { intermediates: true })
      const files = await fs.readDirectoryAsync(directory)
      const referenced = new Set<string>()
      // Run once, not on every download. Corrupt records are isolated and their
      // orphaned images are removed without touching any valid saved preview.
      for (const file of files.filter((value) => value.endsWith('.json'))) {
        const record = await readRecord(directory + file)
        if (!record) continue
        const image = imageFile(record)
        if (liveKeys && !liveKeys.has(record.key)) {
          await fs.deleteAsync(directory + file, { idempotent: true })
          continue
        }
        storedKeys.add(record.key)
        if (image) referenced.add(image)
        if ('imageUri' in record.preview) {
          const { imageUri: _oldUri, ...preview } = record.preview
          await fs.writeAsStringAsync(directory + file, JSON.stringify({ key: record.key, preview, imageFile: image }))
        }
      }
      for (const file of files) {
        if (/\.(jpg|png|gif|webp|avif|svg)$/.test(file) && !referenced.has(file)) {
          await fs.deleteAsync(directory + file, { idempotent: true })
        }
      }
    })().catch((error) => {
      initialization = undefined
      throw error
    })
    await initialization
  }

  async function readPreview(key: string): Promise<BookmarkPreview | undefined> {
    await initialize()
    const record = await readRecord(`${directory}${fileName(key)}.json`)
    if (!record || record.key !== key) return undefined
    const image = imageFile(record)
    const imageUri = image ? directory + image : ''
    if (imageUri && !(await fs.getInfoAsync(imageUri)).exists) return undefined
    return { ...record.preview, imageUri }
  }

  async function writePreview(key: string, value: BookmarkPreview) {
    await initialize()
    if (liveKeys && !liveKeys.has(key)) return
    const previous = await readPreview(key)
    const base = fileName(key)
    let image = ''
    if (value.imageUri) {
      const mime = value.imageUri.match(/^data:image\/([^;]+)/)?.[1]
      const extension = mime === 'svg+xml' ? 'svg' : ['png', 'webp', 'gif', 'avif'].includes(mime || '') ? mime : 'jpg'
      image = `${base}-${value.savedAt}.${extension}`
      if (value.imageUri.startsWith('data:')) {
        await fs.writeAsStringAsync(directory + image, value.imageUri.split(',')[1], {
          encoding: fs.EncodingType.Base64,
        })
      } else {
        await fs.copyAsync({ from: value.imageUri, to: directory + image })
      }
    }
    const { imageUri, ...preview } = value
    try {
      if (liveKeys && !liveKeys.has(key)) {
        if (image) await fs.deleteAsync(directory + image, { idempotent: true })
        return
      }
      await fs.writeAsStringAsync(`${directory}${base}.json`, JSON.stringify({ key, preview, imageFile: image }))
      storedKeys.add(key)
    } catch (error) {
      if (image && directory + image !== previous?.imageUri)
        await fs.deleteAsync(directory + image, { idempotent: true })
      throw error
    }
    if (previous?.imageUri && previous.imageUri !== directory + image) {
      await fs.deleteAsync(previous.imageUri, { idempotent: true })
    }
    if (imageUri.startsWith('file:') && !imageUri.startsWith(directory)) {
      await fs.deleteAsync(imageUri, { idempotent: true })
    }
  }

  async function prunePreviews(keys: ReadonlySet<string>) {
    liveKeys = keys
    await initialize()
    // Initialization indexes existing records once. URL typing/additions do no
    // filesystem work; only removed cached keys need their record/image read.
    for (const key of [...storedKeys]) {
      if (liveKeys.has(key)) continue
      const uri = `${directory}${fileName(key)}.json`
      const record = await readRecord(uri)
      if (liveKeys.has(key)) continue
      if (record && record.key !== key) continue
      const image = record ? imageFile(record) : ''
      await fs.deleteAsync(uri, { idempotent: true })
      if (image) await fs.deleteAsync(directory + image, { idempotent: true })
      storedKeys.delete(key)
    }
  }

  return { readPreview, writePreview, prunePreviews }
}
