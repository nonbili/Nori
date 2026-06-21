import type { BookmarkTransferFormat } from '@/lib/bookmark-transfer'

export interface BookmarkImportAssetInfo {
  name?: string | null
  mimeType?: string | null
}

export const inferBookmarkImportFormat = (
  asset: BookmarkImportAssetInfo,
  content: string,
): BookmarkTransferFormat => {
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

export const getReadableBookmarkImportUriCandidates = (uri: string) => {
  const candidates = [uri]
  if (uri.startsWith('/')) {
    candidates.push(`file://${uri}`)
  }
  if (uri.startsWith('file://')) {
    candidates.push(uri.replace(/^file:\/\//, ''))
  }
  return [...new Set(candidates)]
}

export const sanitizeBookmarkImportFileName = (name?: string | null, now = Date.now()) => {
  const safe = name?.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return safe || `shared-bookmarks-${now}.txt`
}

export const decodeBookmarkImportBase64 = (base64: string) => {
  const bytes = Uint8Array.from(globalThis.atob(base64), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}
