import * as FileSystem from 'expo-file-system/legacy'
import { batch } from '@legendapp/state'
import {
  mergeImportedBookmarks,
  parseBookmarksForImport,
} from '@/lib/bookmark-transfer'
import {
  decodeBookmarkImportBase64,
  getReadableBookmarkImportUriCandidates,
  inferBookmarkImportFormat,
  sanitizeBookmarkImportFileName,
} from '@/lib/bookmark-import-utils'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'

export interface BookmarkImportAsset {
  uri: string
  name?: string | null
  mimeType?: string | null
  base64?: string | null
}

const readContentUriViaCache = async (asset: BookmarkImportAsset) => {
  if (!asset.uri.startsWith('content://') || !FileSystem.cacheDirectory) {
    return null
  }

  const destination = `${FileSystem.cacheDirectory}${sanitizeBookmarkImportFileName(asset.name)}`
  await FileSystem.copyAsync({
    from: asset.uri,
    to: destination,
  })
  return FileSystem.readAsStringAsync(destination)
}

export const readBookmarkImportText = async (asset: BookmarkImportAsset) => {
  if (asset.base64) {
    return decodeBookmarkImportBase64(asset.base64)
  }

  let lastError: unknown
  for (const uri of getReadableBookmarkImportUriCandidates(asset.uri)) {
    try {
      return await FileSystem.readAsStringAsync(uri)
    } catch (error) {
      lastError = error
    }
  }

  try {
    const content = await readContentUriViaCache(asset)
    if (content != null) {
      return content
    }
  } catch (error) {
    lastError = error
  }

  if (asset.uri.startsWith('content://')) {
    throw lastError instanceof Error ? lastError : new Error('Unable to read shared file')
  }

  try {
    const response = await fetch(asset.uri)
    if (response.ok) {
      return await response.text()
    }
  } catch (error) {
    lastError = error
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to read shared file')
}

export const importBookmarksFromAsset = async (asset: BookmarkImportAsset) => {
  const content = await readBookmarkImportText(asset)
  return importBookmarksFromText(content, asset)
}

export const importBookmarksFromText = (content: string, asset: Pick<BookmarkImportAsset, 'name' | 'mimeType'>) => {
  const imported = parseBookmarksForImport(content, inferBookmarkImportFormat(asset, content))
  const merged = mergeImportedBookmarks(lists$.lists.get(), bookmarks$.bookmarks.get(), imported)
  if (merged.importedCount) {
    batch(() => {
      lists$.lists.set(merged.lists)
      bookmarks$.bookmarks.set(merged.bookmarks)
    })
  }
  return merged.importedCount
}

export const countBookmarksInImportText = (content: string, asset: Pick<BookmarkImportAsset, 'name' | 'mimeType'>) =>
  parseBookmarksForImport(content, inferBookmarkImportFormat(asset, content)).length
