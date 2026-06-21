import { describe, expect, it } from 'bun:test'
import {
  exportBookmarksToHtml,
  exportBookmarksToPlainText,
  mergeImportedBookmarks,
  parseBookmarksForImport,
} from './bookmark-transfer'
import { createRowJsonState, normalizeBookmarks, normalizeLists, patchRowState } from './nori-data'

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

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out).toContain('# Read\nOne\thttps://one.example')
    expect(out).toContain('# SNS\nX\thttps://x.com')
    expect(out.endsWith('\n')).toBe(true)
  })

  it('does not export hidden or deleted bookmark rows', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'visible', listId: 'read', title: 'Visible', url: 'https://visible.example', icon: '', json: { visible: true } },
      { id: 'hidden', listId: 'read', title: 'Hidden', url: 'https://hidden.example', icon: '', json: { visible: false } },
      { id: 'deleted', listId: 'read', title: 'Deleted', url: 'https://deleted.example', icon: '', json: { visible: true, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out).toContain('Visible\thttps://visible.example')
    expect(out).not.toContain('Hidden\thttps://hidden.example')
    expect(out).not.toContain('Deleted\thttps://deleted.example')
  })

  it('does not export hidden or deleted list sections', () => {
    const lists = normalizeLists([
      { id: 'visible', name: 'Visible', json: { visible: true } },
      { id: 'hidden', name: 'Hidden', json: { visible: false } },
      { id: 'deleted', name: 'Deleted', json: { visible: true, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'visible-bookmark', listId: 'visible', title: 'Visible', url: 'https://visible.example', icon: '', json: { visible: true } },
      { id: 'hidden-bookmark', listId: 'hidden', title: 'Hidden', url: 'https://hidden.example', icon: '', json: { visible: true } },
      { id: 'deleted-bookmark', listId: 'deleted', title: 'Deleted', url: 'https://deleted.example', icon: '', json: { visible: true } },
    ])

    const out = exportBookmarksToHtml(lists, bookmarks)
    expect(out).toContain('>Visible</H3>')
    expect(out).not.toContain('>Hidden</H3>')
    expect(out).not.toContain('>Deleted</H3>')
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

  it('escapes tabs and newlines in plain export list names and titles', () => {
    const lists = normalizeLists([{ id: 'l', name: 'My\tList', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'b', listId: 'l', title: 'Has\ttab\nnewline', url: 'https://example.com/', icon: '', json: { visible: true } },
    ])

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out.split('\n')[0]).toBe('# My List')
    expect(out).toContain('Has tab newline\thttps://example.com/')
  })

  it('escapes html export list names, urls, icons, and titles', () => {
    const lists = normalizeLists([{ id: 'l', name: 'My <List>', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'b', listId: 'l', title: 'A & B', url: 'https://example.com/?a=1&b=2', icon: 'https://icon.example/?x=1&y=2', json: { visible: true } },
    ])

    const out = exportBookmarksToHtml(lists, bookmarks)
    expect(out).toContain('>My &lt;List&gt;</H3>')
    expect(out).toContain('HREF="https://example.com/?a=1&amp;b=2"')
    expect(out).toContain('ICON="https://icon.example/?x=1&amp;y=2"')
    expect(out).toContain('>A &amp; B</A>')
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

  it('keeps duplicate imports out even when an existing bookmark is hidden', () => {
    const lists = normalizeLists([{ id: 'existing', name: 'Existing', json: createRowJsonState({ visible: true }) }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'hidden', listId: 'existing', title: 'Hidden', url: 'https://hidden.example', icon: '', json: { visible: false } },
    ])

    const result = mergeImportedBookmarks(lists, bookmarks, [
      { listName: 'Existing', title: 'Duplicate', url: 'https://hidden.example/' },
    ])

    expect(result.importedCount).toBe(0)
    expect(result.bookmarks.filter((item) => item.url === 'https://hidden.example')).toHaveLength(1)
  })

  it('allows importing a url again after the existing bookmark was deleted', () => {
    const lists = normalizeLists([{ id: 'existing', name: 'Existing', json: createRowJsonState({ visible: true }) }])
    const [bookmark] = normalizeBookmarks(lists, [
      { id: 'deleted', listId: 'existing', title: 'Deleted', url: 'https://deleted.example', icon: '', json: { visible: true } },
    ]).filter((item) => item.id === 'deleted')
    const bookmarks = [patchRowState(bookmark, { deleted_at: '2026-06-21T00:00:00.000Z', visible: false })]

    const result = mergeImportedBookmarks(lists, bookmarks, [
      { listName: 'Existing', title: 'Restored', url: 'https://deleted.example/' },
    ])

    expect(result.importedCount).toBe(1)
    expect(result.bookmarks.some((item) => item.title === 'Restored')).toBe(true)
  })
})
