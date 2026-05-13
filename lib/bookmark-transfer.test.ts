import { describe, expect, it } from 'bun:test'
import {
  exportBookmarksToHtml,
  exportBookmarksToPlainText,
  mergeImportedBookmarks,
  parseBookmarksForImport,
} from './bookmark-transfer'
import { createRowJsonState, normalizeBookmarks, normalizeLists } from './nori-data'

describe('bookmark transfer', () => {
  it('exports bookmarks as Netscape bookmark HTML', () => {
    const lists = normalizeLists([{ id: 'work', name: 'Work', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'docs', listId: 'work', title: 'Docs', url: 'https://example.com/docs', icon: '', json: { visible: true } },
    ])

    const html = exportBookmarksToHtml(lists, bookmarks)

    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
    expect(html).toContain('<H3')
    expect(html).toContain('>Work</H3>')
    expect(html).toContain('<A HREF="https://example.com/docs"')
    expect(html).toContain('>Docs</A>')
  })

  it('exports bookmarks as plain sections', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'one', listId: 'read', title: 'One', url: 'https://one.example', icon: '', json: { visible: true } },
    ])

    expect(exportBookmarksToPlainText(lists, bookmarks)).toBe('# Read\nOne\thttps://one.example\n')
  })

  it('imports Netscape bookmark HTML folders', () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>News</H3>
        <DL><p>
          <DT><A HREF="https://news.example/path">Example News</A>
        </DL><p>
      </DL><p>
    `

    expect(parseBookmarksForImport(html, 'html')).toEqual([
      { listName: 'News', title: 'Example News', url: 'https://news.example/path' },
    ])
  })

  it('imports plain bookmark lists with headings and tab titles', () => {
    const plain = '# Later\nExample\thttps://example.com\nhttps://solo.example'

    expect(parseBookmarksForImport(plain, 'plain')).toEqual([
      { listName: 'Later', title: 'Example', url: 'https://example.com/' },
      { listName: 'Later', title: 'solo.example', url: 'https://solo.example/' },
    ])
  })

  it('decodes named and numeric entities in Netscape exports', () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3>Caf&#233; &amp; Bar</H3>
        <DL><p>
          <DT><A HREF="https://example.com/?a=1&amp;b=2">Q&#x26;A</A>
        </DL><p>
      </DL><p>
    `

    const result = parseBookmarksForImport(html, 'html')
    expect(result).toEqual([
      { listName: 'Café & Bar', title: 'Q&A', url: 'https://example.com/?a=1&b=2' },
    ])
  })

  it('finds folder name across nested DT wrappers (real Chrome export shape)', () => {
    const html = `
      <DL><p>
        <DT><H3>Outer</H3>
        <DL><p>
          <DT><H3>Inner</H3>
          <DL><p>
            <DT><A HREF="https://nested.example/">Nested</A>
          </DL><p>
        </DL><p>
      </DL><p>
    `
    const result = parseBookmarksForImport(html, 'html')
    expect(result).toHaveLength(1)
    expect(result[0].listName).toBe('Inner')
  })

  it('escapes tabs and newlines in plain export titles', () => {
    const lists = normalizeLists([{ id: 'l', name: 'My\tList', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'b', listId: 'l', title: 'Has\ttab\nnewline', url: 'https://example.com/', icon: '', json: { visible: true } },
    ])

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out.split('\n')[0]).toBe('# My List')
    expect(out).toContain('Has tab newline\thttps://example.com/')
  })

  it('escapes tabs and newlines in plain export titles', () => {
    const lists = normalizeLists([{ id: 'l', name: 'My\tList', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'b', listId: 'l', title: 'Has\ttab\nnewline', url: 'https://example.com/', icon: '', json: { visible: true } },
    ])

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out.split('\n')[0]).toBe('# My List')
    expect(out).toContain('Has tab newline\thttps://example.com/')
  })

  it('dedupes imports against existing urls regardless of import order normalization', () => {
    const lists = normalizeLists([{ id: 'x', name: 'X', json: createRowJsonState({ visible: true }) }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'a', listId: 'x', title: 'A', url: 'https://example.com/page', icon: '', json: { visible: true } },
    ])

    const result = mergeImportedBookmarks(lists, bookmarks, [
      { listName: 'X', title: 'A dup', url: 'https://example.com/page' },
      { listName: 'X', title: 'A dup with slash', url: 'https://example.com/page/' },
    ])

    expect(result.importedCount).toBe(1)
  })

  it('merges imported bookmarks without duplicating existing urls', () => {
    const lists = normalizeLists([{ id: 'existing', name: 'Existing', json: createRowJsonState({ visible: true }) }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'old', listId: 'existing', title: 'Old', url: 'https://old.example', icon: '', json: { visible: true } },
    ])

    const result = mergeImportedBookmarks(lists, bookmarks, [
      { listName: 'Existing', title: 'Skip', url: 'https://old.example/' },
      { listName: 'New List', title: 'New', url: 'https://new.example/' },
    ])

    expect(result.importedCount).toBe(1)
    expect(result.lists.some((item) => item.name === 'New List')).toBe(true)
    expect(result.bookmarks.some((item) => item.url === 'https://new.example/')).toBe(true)
  })
})
