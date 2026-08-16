import { describe, expect, it } from 'bun:test'
import {
  decodeBookmarkImportBase64,
  getReadableBookmarkImportUriCandidates,
  inferBookmarkImportFormat,
  sanitizeBookmarkImportFileName,
} from './bookmark-import-utils'

describe('bookmark import utils', () => {
  it('infers html imports from mime type or filename', () => {
    expect(inferBookmarkImportFormat({ mimeType: 'text/html' }, 'plain text')).toBe('html')
    expect(inferBookmarkImportFormat({ name: 'bookmarks.HTM' }, 'plain text')).toBe('html')
  })

  it('infers html imports from Netscape or dl content', () => {
    expect(inferBookmarkImportFormat({}, '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe('html')
    expect(inferBookmarkImportFormat({}, '<DL><p></DL><p>')).toBe('html')
  })

  it('infers json backups from content regardless of file name', () => {
    const backup = '{\n  "format": "nori-backup",\n  "version": 1,\n  "lists": [],\n  "bookmarks": []\n}'
    expect(inferBookmarkImportFormat({ name: 'backup.json', mimeType: 'application/json' }, backup)).toBe('json')
    expect(inferBookmarkImportFormat({ name: 'nori-bookmarks-2026-08-16.txt' }, backup)).toBe('json')
  })

  it('does not treat unrelated json as a backup', () => {
    expect(inferBookmarkImportFormat({ name: 'other.json', mimeType: 'application/json' }, '{"a":1}')).toBe('plain')
  })

  it('classifies invalid and future Nori backups as backups', () => {
    expect(inferBookmarkImportFormat({}, '{"format":"nori-backup","version":2,"lists":[],"bookmarks":[]}')).toBe('json')
    expect(inferBookmarkImportFormat({}, '{"format":"nori-backup","version":1,"lists":[{"id":"a","name":123}],"bookmarks":[]}')).toBe('json')
  })

  it('defaults import format to plain text', () => {
    expect(inferBookmarkImportFormat({ name: 'bookmarks.txt', mimeType: 'text/plain' }, '# Later')).toBe('plain')
  })

  it('builds readable URI candidates for raw paths and file URIs', () => {
    expect(getReadableBookmarkImportUriCandidates('/tmp/bookmarks.txt')).toEqual([
      '/tmp/bookmarks.txt',
      'file:///tmp/bookmarks.txt',
    ])
    expect(getReadableBookmarkImportUriCandidates('file:///tmp/bookmarks.txt')).toEqual([
      'file:///tmp/bookmarks.txt',
      '/tmp/bookmarks.txt',
    ])
    expect(getReadableBookmarkImportUriCandidates('content://provider/bookmarks')).toEqual([
      'content://provider/bookmarks',
    ])
  })

  it('sanitizes cache filenames with deterministic fallback names', () => {
    expect(sanitizeBookmarkImportFileName(' My Bookmarks!.html ')).toBe('My_Bookmarks_.html')
    expect(sanitizeBookmarkImportFileName('   ', 123)).toBe('shared-bookmarks-123.txt')
    expect(sanitizeBookmarkImportFileName(null, 456)).toBe('shared-bookmarks-456.txt')
  })

  it('decodes utf-8 base64 bookmark text', () => {
    const base64 = btoa(unescape(encodeURIComponent('# Café\nExample https://example.com')))

    expect(decodeBookmarkImportBase64(base64)).toBe('# Café\nExample https://example.com')
  })
})
