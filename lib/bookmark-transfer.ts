import * as cheerio from 'cheerio/slim'
import type { AnyNode } from 'domhandler'
import { nanoid } from 'nanoid'
import { getDuckDuckGoIcon } from './bookmark'
import {
  createRowJsonState,
  getLiveBookmarksInList,
  getLiveLists,
  isDeleted,
  isoNow,
  normalizeBookmarks,
  normalizeLists,
  patchRowState,
  withUpdatedAt,
  type BookmarkListData,
  type BookmarkRecordData,
  type RowJsonState,
} from './nori-data'
import { parseHttpUrl } from './url'

export type BookmarkTransferFormat = 'html' | 'plain' | 'json'
// The JSON backup is restored wholesale, so it never goes through the
// name/url merge that the interchange formats use.
export type BookmarkMergeFormat = Exclude<BookmarkTransferFormat, 'json'>

export interface ParsedBookmarkImport {
  listName: string
  title: string
  url: string
  icon?: string
  tags?: string[]
}

export interface BookmarkImportResult {
  lists: BookmarkListData[]
  bookmarks: BookmarkRecordData[]
  importedCount: number
}

const DEFAULT_IMPORT_LIST = 'Imported'
const genTransferId = () => nanoid(6)

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  amp: '&',
  nbsp: ' ',
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint)
        } catch {
          return match
        }
      }
      return match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function normalizeHttpUrl(value: string) {
  try {
    return parseHttpUrl(value).toString()
  } catch {
    return ''
  }
}

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function exportBookmarksToHtml(lists: BookmarkListData[], bookmarks: BookmarkRecordData[]) {
  const exportedLists = getLiveLists(lists)
  const addDate = Math.floor(Date.now() / 1000)
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Nori Bookmarks</TITLE>',
    '<H1>Nori Bookmarks</H1>',
    '<DL><p>',
  ]

  for (const list of exportedLists) {
    const listBookmarks = getLiveBookmarksInList(bookmarks, list.id)
    if (!listBookmarks.length) {
      continue
    }
    lines.push(`  <DT><H3 ADD_DATE="${addDate}">${escapeHtml(list.name)}</H3>`)
    lines.push('  <DL><p>')
    for (const bookmark of listBookmarks) {
      const icon = bookmark.icon ? ` ICON="${escapeHtml(bookmark.icon)}"` : ''
      lines.push(`    <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${addDate}"${icon}>${escapeHtml(bookmark.title)}</A>`)
    }
    lines.push('  </DL><p>')
  }

  lines.push('</DL><p>')
  return `${lines.join('\n')}\n`
}

export const BOOKMARK_BACKUP_FORMAT = 'nori-backup'
export const BOOKMARK_BACKUP_VERSION = 1

export interface BookmarkBackupFile {
  format: typeof BOOKMARK_BACKUP_FORMAT
  version: number
  exportedAt: string
  lists: BookmarkListData[]
  bookmarks: BookmarkRecordData[]
}

export interface BookmarkBackupData {
  lists: BookmarkListData[]
  bookmarks: BookmarkRecordData[]
}

// Unlike the interchange formats this is a verbatim dump: ids, timestamps, and
// the whole json blob (tags, visible, sort_index) survive, and deleted rows stay
// in so their tombstones are not lost for sync.
export function exportBookmarksToJson(lists: BookmarkListData[], bookmarks: BookmarkRecordData[]) {
  const backup: BookmarkBackupFile = {
    format: BOOKMARK_BACKUP_FORMAT,
    version: BOOKMARK_BACKUP_VERSION,
    exportedAt: isoNow(),
    lists,
    bookmarks,
  }
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function isBookmarkBackupText(content: string) {
  if (!content.trimStart().startsWith('{')) {
    return false
  }
  return new RegExp(`"format"\\s*:\\s*"${BOOKMARK_BACKUP_FORMAT}"`).test(content)
}

export function parseBookmarksBackup(content: string): BookmarkBackupData | null {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const file = raw as Partial<BookmarkBackupFile>
  if (file.format !== BOOKMARK_BACKUP_FORMAT) {
    return null
  }
  if (typeof file.version !== 'number' || file.version > BOOKMARK_BACKUP_VERSION) {
    return null
  }
  // Both collections must be present and well formed: normalizeLists/Bookmarks
  // turn a missing one into starter data, which would silently reset the user
  // instead of reporting an unreadable backup.
  if (!Array.isArray(file.lists) || !Array.isArray(file.bookmarks)) {
    return null
  }

  const lists = normalizeLists(file.lists)
  return {
    lists,
    bookmarks: normalizeBookmarks(lists, file.bookmarks),
  }
}

// Rows are never dropped from the store — deletes are tombstones — because the
// sync watcher only marks ids present in the array as pending. A row silently
// removed here would keep its live remote copy and be resurrected on next sync,
// so anything missing from the backup is tombstoned instead.
function tombstoneRowsMissingFrom<T extends { id: string; json: RowJsonState; updatedAt: string }>(
  current: T[],
  next: T[],
  now: string,
) {
  const nextIds = new Set(next.map((item) => item.id))
  const removed = current
    .filter((item) => !nextIds.has(item.id))
    .map((item) => (
      isDeleted(item)
        ? item
        : withUpdatedAt(patchRowState(item, { deleted_at: now, visible: false }), now)
    ))
  return [...next, ...removed]
}

export function applyBookmarkBackup(
  currentLists: BookmarkListData[],
  currentBookmarks: BookmarkRecordData[],
  backup: BookmarkBackupData,
  now = isoNow(),
): BookmarkBackupData {
  const lists = tombstoneRowsMissingFrom(currentLists, backup.lists, now)
  const bookmarks = tombstoneRowsMissingFrom(currentBookmarks, backup.bookmarks, now)
  const normalizedLists = normalizeLists(lists)
  return {
    lists: normalizedLists,
    bookmarks: normalizeBookmarks(normalizedLists, bookmarks),
  }
}

function sanitizePlainField(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

export function exportBookmarksToPlainText(lists: BookmarkListData[], bookmarks: BookmarkRecordData[]) {
  const sections = getLiveLists(lists)
    .map((list) => {
      const lines = getLiveBookmarksInList(bookmarks, list.id).map(
        (bookmark) => `${sanitizePlainField(bookmark.title)}\t${bookmark.url}`,
      )
      return lines.length ? [`# ${sanitizePlainField(list.name)}`, ...lines].join('\n') : ''
    })
    .filter(Boolean)

  return `${sections.join('\n\n')}\n`
}

function parsePlainBookmarks(content: string) {
  const parsed: ParsedBookmarkImport[] = []
  let listName = DEFAULT_IMPORT_LIST

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    if (line.startsWith('#')) {
      listName = line.replace(/^#+\s*/, '').trim() || DEFAULT_IMPORT_LIST
      continue
    }

    const markdownMatch = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i)
    if (markdownMatch) {
      const url = normalizeHttpUrl(markdownMatch[2])
      if (url) {
        parsed.push({ listName, title: markdownMatch[1].trim() || titleFromUrl(url), url })
      }
      continue
    }

    const urlMatch = line.match(/https?:\/\/\S+/i)
    if (!urlMatch) {
      continue
    }

    const url = normalizeHttpUrl(urlMatch[0].replace(/[),.;]+$/, ''))
    if (!url) {
      continue
    }
    const before = line.slice(0, urlMatch.index).replace(/[-:,|\t]+$/, '').trim()
    const after = line.slice((urlMatch.index || 0) + urlMatch[0].length).replace(/^[-:,|\t]+/, '').trim()
    const title = before || after || titleFromUrl(url)
    parsed.push({ listName, title, url })
  }

  return parsed
}

// Browsers wrap every bookmark in a root folder that carries no meaning for us
// ("Bookmarks bar", "Bookmarks Menu", …). Those are dropped when a real folder
// sits below them, so the user's own top folder becomes the list.
const ROOT_FOLDER_NAMES = new Set([
  'bookmarks',
  'bookmarks bar',
  'bookmarks toolbar',
  'bookmarks menu',
  'other bookmarks',
  'mobile bookmarks',
  'favorites',
  'favorites bar',
  'bookmark bar',
])

// Outermost folder first.
function findEnclosingFolderPath($: cheerio.CheerioAPI, element: AnyNode): string[] {
  const path: string[] = []
  let current = $(element).parent()
  while (current.length) {
    if (current.is('dl')) {
      const preceding = current.prevAll()
      for (let i = 0; i < preceding.length; i += 1) {
        const node = preceding.eq(i)
        const h3 = node.is('h3') ? node : node.find('h3').first()
        const name = h3.text().trim()
        if (name) {
          path.push(name)
          break
        }
      }
    }
    current = current.parent()
  }
  return path.reverse()
}

// The first meaningful folder becomes the list; everything nested below it
// becomes tags, so a subfolder can be recovered by filtering the list by tag.
function splitFolderPath(path: string[]) {
  const segments = path.map((item) => item.trim()).filter(Boolean)
  while (segments.length > 1 && ROOT_FOLDER_NAMES.has(segments[0].toLowerCase())) {
    segments.shift()
  }

  const seen = new Set<string>()
  const tags: string[] = []
  for (const segment of segments.slice(1)) {
    const key = segment.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    tags.push(segment)
  }

  return { listName: segments[0] || '', tags }
}

function parseHtmlBookmarks(content: string) {
  const $ = cheerio.load(content)
  const parsed: ParsedBookmarkImport[] = []

  $('a[href]').each((_, element) => {
    const link = $(element)
    const url = normalizeHttpUrl(link.attr('href') || '')
    if (!url) {
      return
    }

    const { listName, tags } = splitFolderPath(findEnclosingFolderPath($, element))
    parsed.push({
      listName: listName || DEFAULT_IMPORT_LIST,
      title: link.text().trim() || titleFromUrl(url),
      url,
      icon: link.attr('icon') || link.attr('ICON') || undefined,
      ...(tags.length ? { tags } : {}),
    })
  })

  if (parsed.length) {
    return parsed
  }

  const folderPattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]*?(?=<h3\b|$)/gi
  let folderMatch: RegExpExecArray | null
  while ((folderMatch = folderPattern.exec(content))) {
    const listName = decodeHtml(folderMatch[1].replace(/<[^>]+>/g, '').trim()) || DEFAULT_IMPORT_LIST
    const block = folderMatch[0]
    const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkPattern.exec(block))) {
      const href = linkMatch[1].match(/\bhref=(["'])(.*?)\1/i)?.[2] || ''
      const url = normalizeHttpUrl(decodeHtml(href))
      if (url) {
        parsed.push({
          listName,
          title: decodeHtml(linkMatch[2].replace(/<[^>]+>/g, '').trim()) || titleFromUrl(url),
          url,
        })
      }
    }
  }

  return parsed
}

export function parseBookmarksForImport(content: string, format: BookmarkMergeFormat) {
  return format === 'html' ? parseHtmlBookmarks(content) : parsePlainBookmarks(content)
}

export function mergeImportedBookmarks(
  currentLists: BookmarkListData[],
  currentBookmarks: BookmarkRecordData[],
  imported: ParsedBookmarkImport[],
): BookmarkImportResult {
  const existingUrls = new Set(
    currentBookmarks
      .filter((item) => !isDeleted(item))
      .map((item) => normalizeHttpUrl(item.url) || item.url),
  )
  const importedByList = new Map<string, ParsedBookmarkImport[]>()

  for (const item of imported) {
    const key = normalizeHttpUrl(item.url) || item.url
    if (existingUrls.has(key)) {
      continue
    }
    existingUrls.add(key)
    const listName = item.listName.trim() || DEFAULT_IMPORT_LIST
    importedByList.set(listName, [...(importedByList.get(listName) || []), item])
  }

  if (!importedByList.size) {
    return { lists: currentLists, bookmarks: currentBookmarks, importedCount: 0 }
  }

  const now = isoNow()
  const nextLists = [...currentLists]
  const nextBookmarks = [...currentBookmarks]
  const listByName = new Map(currentLists.filter((item) => !item.json.deleted_at).map((item) => [item.name.trim().toLowerCase(), item]))
  let importedCount = 0

  for (const [listName, listBookmarks] of importedByList.entries()) {
    const key = listName.toLowerCase()
    let list = listByName.get(key)
    if (!list) {
      list = {
        id: genTransferId(),
        name: listName,
        json: createRowJsonState({
          visible: true,
          sort_index: nextLists.filter((item) => !isDeleted(item)).length,
          deleted_at: null,
        }),
        createdAt: now,
        updatedAt: now,
      }
      nextLists.push(list)
      listByName.set(key, list)
    }

    const existingInList = nextBookmarks.filter((item) => item.listId === list.id && !isDeleted(item)).length
    nextBookmarks.push(...listBookmarks.map((item, index) => ({
      id: genTransferId(),
      listId: list.id,
      url: item.url,
      title: item.title.trim() || titleFromUrl(item.url),
      icon: item.icon?.trim() || getDuckDuckGoIcon(item.url),
      json: createRowJsonState({
        visible: true,
        sort_index: existingInList + index,
        deleted_at: null,
        tags: item.tags,
      }),
      createdAt: now,
      updatedAt: now,
    })))
    importedCount += listBookmarks.length
  }

  const lists = normalizeLists(nextLists)
  return {
    lists,
    bookmarks: normalizeBookmarks(lists, nextBookmarks),
    importedCount,
  }
}
