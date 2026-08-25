import {
  applyBookmarkBackup,
  exportBookmarksToHtml,
  exportBookmarksToJson,
  exportBookmarksToPlainText,
  mergeImportedBookmarks,
  parseBookmarksBackup,
  parseBookmarksForImport,
} from 'nori/lib/bookmark-transfer'
import type { NoriBookmark, NoriList } from './model'

export type TransferFormat = 'json' | 'html' | 'plain'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportBookmarks(format: TransferFormat, lists: NoriList[], bookmarks: NoriBookmark[]) {
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json')
    download(`nori-bookmarks-${stamp}.json`, exportBookmarksToJson(lists, bookmarks), 'application/json')
  else if (format === 'html')
    download(`nori-bookmarks-${stamp}.html`, exportBookmarksToHtml(lists, bookmarks), 'text/html')
  else download(`nori-bookmarks-${stamp}.txt`, exportBookmarksToPlainText(lists, bookmarks), 'text/plain')
}

export async function readImportFile(file: File, lists: NoriList[], bookmarks: NoriBookmark[]) {
  const text = await file.text()
  if (file.name.toLowerCase().endsWith('.json')) {
    const backup = parseBookmarksBackup(text)
    if (!backup) return null
    return applyBookmarkBackup(lists, bookmarks, backup)
  }
  const parsed = parseBookmarksForImport(text, /\.html?$/i.test(file.name) ? 'html' : 'plain')
  return mergeImportedBookmarks(lists, bookmarks, parsed)
}
