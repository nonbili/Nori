import * as FileSystem from 'expo-file-system/legacy'
import { batch } from '@legendapp/state'
import {
  mergeImportedBookmarks,
  parseBookmarksForImport,
  type BookmarkTransferFormat,
} from '@/lib/bookmark-transfer'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'

export interface BookmarkImportAsset {
  uri: string
  name?: string | null
  mimeType?: string | null
  base64?: string | null
}

export const inferBookmarkImportFormat = (asset: Pick<BookmarkImportAsset, 'name' | 'mimeType'>, content: string): BookmarkTransferFormat => {
  const name = asset.name?.toLowerCase() || ''
  const mimeType = asset.mimeType?.toLowerCase() || ''
  if (mimeType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) {
    return 'html'
  }
  if (/<!doctype\s+netscape-bookmark/i.test(content) || /<dl\b/i.test(content)) {
    return 'html'
  }
  return 'plain'
}

export const readBookmarkImportText = async (asset: BookmarkImportAsset) => {
  if (asset.base64) {
    const bytes = Uint8Array.from(globalThis.atob(asset.base64), (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  }
  return FileSystem.readAsStringAsync(asset.uri)
}

export const importBookmarksFromAsset = async (asset: BookmarkImportAsset) => {
  const content = await readBookmarkImportText(asset)
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
