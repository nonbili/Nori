import { describe, expect, it } from 'bun:test'
import { htmlLooksLikeBookmarkExport, parseSharedUrl, parseSharedUrls } from './share-intent'

describe('share intent parsing', () => {
  it('extracts urls from shared text', () => {
    expect(parseSharedUrl({ text: 'Read https://example.com/path later' })).toBe('https://example.com/path')
  })

  it('prefers a valid direct web url over shared text', () => {
    expect(parseSharedUrl({
      webUrl: ' https://direct.example/path ',
      text: 'Read https://text.example/path later',
    })).toBe('https://direct.example/path')
  })

  it('accepts exact text urls and rejects unsupported protocols', () => {
    expect(parseSharedUrl({ text: 'https://example.com/path' })).toBe('https://example.com/path')
    expect(parseSharedUrl({ webUrl: 'ftp://example.com/file', text: 'mailto:test@example.com' })).toBeNull()
  })

  it('returns null for empty or missing payloads', () => {
    expect(parseSharedUrl()).toBeNull()
    expect(parseSharedUrl(null)).toBeNull()
    expect(parseSharedUrl({ text: '   ' })).toBeNull()
  })

  it('extracts every url from a multi link share', () => {
    expect(parseSharedUrls({
      text: 'https://one.example/a\nhttps://two.example/b\nhttps://three.example/c',
    })).toEqual([
      'https://one.example/a',
      'https://two.example/b',
      'https://three.example/c',
    ])
  })

  it('deduplicates urls and drops trailing punctuation', () => {
    expect(parseSharedUrls({
      webUrl: 'https://one.example/a',
      text: 'See (https://one.example/a) and https://two.example/b.',
    })).toEqual(['https://one.example/a', 'https://two.example/b'])
  })

  it('returns an empty list when nothing is shared', () => {
    expect(parseSharedUrls()).toEqual([])
    expect(parseSharedUrls({ text: 'no links here' })).toEqual([])
  })

  it('detects bookmark export html', () => {
    expect(htmlLooksLikeBookmarkExport('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p></DL><p>')).toBe(true)
    expect(htmlLooksLikeBookmarkExport('<html><body><h1>Bookmarks</h1></body></html>')).toBe(true)
    expect(htmlLooksLikeBookmarkExport('<html><head><title>Page</title></head></html>')).toBe(false)
  })
})
