import * as cheerio from 'cheerio/slim'
import type { AnyNode } from 'domhandler'
import { nanoid } from 'nanoid'
import { getDuckDuckGoIcon } from './bookmark'
import {
  createRowJsonState,
  getVisibleBookmarks,
  getVisibleLists,
  isDeleted,
  isoNow,
  normalizeBookmarks,
  normalizeLists,
  type BookmarkListData,
  type BookmarkRecordData,
} from './nori-data'
import { parseHttpUrl } from './url'

export type BookmarkTransferFormat = 'html' | 'plain'

export interface ParsedBookmarkImport {
  listName: string
  title: string
  url: string
  icon?: string
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
  const visibleLists = getVisibleLists(lists)
  const addDate = Math.floor(Date.now() / 1000)
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Nori Bookmarks</TITLE>',
    '<H1>Nori Bookmarks</H1>',
    '<DL><p>',
  ]

  for (const list of visibleLists) {
    const listBookmarks = getVisibleBookmarks(bookmarks, list.id)
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

function sanitizePlainField(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

export function exportBookmarksToPlainText(lists: BookmarkListData[], bookmarks: BookmarkRecordData[]) {
  const sections = getVisibleLists(lists)
    .map((list) => {
      const lines = getVisibleBookmarks(bookmarks, list.id).map(
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

function findEnclosingFolderName($: cheerio.CheerioAPI, element: AnyNode): string {
  let current = $(element).parent()
  while (current.length) {
    if (current.is('dl')) {
      const preceding = current.prevAll()
      for (let i = 0; i < preceding.length; i += 1) {
        const node = preceding.eq(i)
        const h3 = node.is('h3') ? node : node.find('h3').first()
        const name = h3.text().trim()
        if (name) {
          return name
        }
      }
    }
    current = current.parent()
  }
  return ''
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

    const folder = findEnclosingFolderName($, element)
    parsed.push({
      listName: folder || DEFAULT_IMPORT_LIST,
      title: link.text().trim() || titleFromUrl(url),
      url,
      icon: link.attr('icon') || link.attr('ICON') || undefined,
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

export function parseBookmarksForImport(content: string, format: BookmarkTransferFormat) {
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
      json: createRowJsonState({ visible: true, sort_index: existingInList + index, deleted_at: null }),
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
