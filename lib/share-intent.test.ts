import { describe, expect, it } from 'bun:test'
import { htmlLooksLikeBookmarkExport, parseSharedUrl } from './share-intent'

describe('share intent parsing', () => {
  it('extracts urls from shared text', () => {
    expect(parseSharedUrl({ text: 'Read https://example.com/path later' })).toBe('https://example.com/path')
  })

  it('detects bookmark export html', () => {
    expect(htmlLooksLikeBookmarkExport('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p></DL><p>')).toBe(true)
    expect(htmlLooksLikeBookmarkExport('<html><head><title>Page</title></head></html>')).toBe(false)
  })
})
