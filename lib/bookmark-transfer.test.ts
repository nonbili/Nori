import { describe, expect, it } from 'bun:test'
import {
  applyBookmarkBackup,
  exportBookmarksToHtml,
  exportBookmarksToJson,
  exportBookmarksToPlainText,
  isBookmarkBackupText,
  mergeImportedBookmarks,
  parseBookmarksBackup,
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

  it('exports ui-hidden bookmark rows but not deleted ones', () => {
    const lists = normalizeLists([{ id: 'read', name: 'Read', json: { visible: true } }])
    const bookmarks = normalizeBookmarks(lists, [
      { id: 'visible', listId: 'read', title: 'Visible', url: 'https://visible.example', icon: '', json: { visible: true } },
      { id: 'hidden', listId: 'read', title: 'Hidden', url: 'https://hidden.example', icon: '', json: { visible: false } },
      { id: 'deleted', listId: 'read', title: 'Deleted', url: 'https://deleted.example', icon: '', json: { visible: true, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])

    const out = exportBookmarksToPlainText(lists, bookmarks)
    expect(out).toContain('Visible\thttps://visible.example')
    expect(out).toContain('Hidden\thttps://hidden.example')
    expect(out).not.toContain('Deleted\thttps://deleted.example')
  })

  it('exports ui-hidden list sections but not deleted ones', () => {
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
    expect(out).toContain('>Hidden</H3>')
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

  it('round-trips every field through the json backup', () => {
    const lists = normalizeLists([
      { id: 'work', name: 'Work', json: { visible: true, sort_index: 0 } },
      { id: 'hidden-list', name: 'Hidden list', json: { visible: false, sort_index: 1 } },
      { id: 'gone', name: 'Gone', json: { visible: true, sort_index: 2, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])
    const bookmarks = normalizeBookmarks(lists, [
      {
        id: 'docs',
        listId: 'work',
        title: 'Docs',
        url: 'https://example.com/docs',
        icon: 'https://example.com/favicon.ico',
        json: { visible: true, sort_index: 0, tags: ['Tools', 'Editors'] },
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-02-03T04:05:06.000Z',
      },
      { id: 'stashed', listId: 'work', title: 'Stashed', url: 'https://example.com/stashed', icon: '', json: { visible: false, sort_index: 1 } },
      { id: 'trashed', listId: 'work', title: 'Trashed', url: 'https://example.com/trashed', icon: '', json: { visible: true, sort_index: 2, deleted_at: '2026-06-21T00:00:00.000Z' } },
    ])

    const restored = parseBookmarksBackup(exportBookmarksToJson(lists, bookmarks))

    expect(restored).not.toBeNull()
    expect(restored!.lists).toEqual(lists)
    expect(restored!.bookmarks).toEqual(bookmarks)

    const docs = restored!.bookmarks.find((item) => item.id === 'docs')!
    expect(docs.json.tags).toEqual(['Tools', 'Editors'])
    expect(docs.createdAt).toBe('2026-01-02T03:04:05.000Z')
    expect(docs.updatedAt).toBe('2026-02-03T04:05:06.000Z')
    expect(docs.icon).toBe('https://example.com/favicon.ico')
    // Hidden rows and deletion tombstones both survive.
    expect(restored!.bookmarks.find((item) => item.id === 'stashed')?.json.visible).toBe(false)
    expect(restored!.bookmarks.find((item) => item.id === 'trashed')?.json.deleted_at).toBe('2026-06-21T00:00:00.000Z')
    expect(restored!.lists.find((item) => item.id === 'hidden-list')?.json.visible).toBe(false)
    expect(restored!.lists.find((item) => item.id === 'gone')?.json.deleted_at).toBe('2026-06-21T00:00:00.000Z')
  })

  it('recognises backup files by content', () => {
    const backup = exportBookmarksToJson(normalizeLists([]), [])
    expect(isBookmarkBackupText(backup)).toBe(true)
    expect(isBookmarkBackupText('{"format":"something-else"}')).toBe(false)
    expect(isBookmarkBackupText('{"format":"nori-backup","version":1}')).toBe(true)
    expect(isBookmarkBackupText('{"format":"nori-backup","version":2}')).toBe(true)
    expect(isBookmarkBackupText('{"format":"nori-backup","version":1,"lists":[{"id":"a","name":123}]}')).toBe(true)
    expect(isBookmarkBackupText('<DL><p><DT><A HREF="https://a.example">A</A>')).toBe(false)
  })

  it('rejects malformed, foreign, and newer backup files', () => {
    expect(parseBookmarksBackup('not json')).toBeNull()
    expect(parseBookmarksBackup('[]')).toBeNull()
    expect(parseBookmarksBackup('{"format":"other","version":1,"lists":[],"bookmarks":[]}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":99,"lists":[],"bookmarks":[]}')).toBeNull()
  })

  it('rejects backups with missing or mistyped row collections', () => {
    // These would otherwise normalize into starter data and reset the user.
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1,"lists":[]}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1,"bookmarks":[]}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1,"lists":{},"bookmarks":[]}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1,"lists":[],"bookmarks":null}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":1,"lists":[null],"bookmarks":[null]}')).toBeNull()
  })

  it('rejects unsupported versions and rows without ids', () => {
    expect(parseBookmarksBackup('{"format":"nori-backup","version":0,"lists":[],"bookmarks":[]}')).toBeNull()
    expect(parseBookmarksBackup('{"format":"nori-backup","version":0.5,"lists":[],"bookmarks":[]}')).toBeNull()

    const missingId = JSON.parse(exportBookmarksToJson(
      normalizeLists([{ id: 'work', name: 'Work', json: { visible: true } }]),
      [],
    ))
    delete missingId.lists[0].id
    expect(parseBookmarksBackup(JSON.stringify(missingId))).toBeNull()

    const invalidName = JSON.parse(exportBookmarksToJson(
      normalizeLists([{ id: 'work', name: 'Work', json: { visible: true } }]),
      [],
    ))
    invalidName.lists[0].name = 123
    expect(parseBookmarksBackup(JSON.stringify(invalidName))).toBeNull()

    const orphan = JSON.parse(exportBookmarksToJson(
      normalizeLists([{ id: 'work', name: 'Work', json: { visible: true } }]),
      [],
    ))
    orphan.bookmarks.push({ id: 'orphan', listId: 'missing' })
    expect(parseBookmarksBackup(JSON.stringify(orphan))).toBeNull()
  })

  it('allows starter bookmarks whose starter list will be regenerated', () => {
    const backup = JSON.parse(exportBookmarksToJson(normalizeLists([]), normalizeBookmarks(normalizeLists([]), [])))
    backup.lists = backup.lists.filter((item: { id: string }) => item.id !== 'builtin-sns')

    const parsed = parseBookmarksBackup(JSON.stringify(backup))

    expect(parsed).not.toBeNull()
    expect(parsed!.lists.some((item) => item.id === 'builtin-sns')).toBe(true)
    expect(parsed!.bookmarks.some((item) => item.id === 'builtin-sns-x')).toBe(true)
  })

  it('allows user bookmarks in a starter list the backup omits', () => {
    const lists = normalizeLists([])
    const backup = JSON.parse(exportBookmarksToJson(lists, normalizeBookmarks(lists, [
      { id: 'mine', listId: 'builtin-sns', title: 'Mine', url: 'https://mine.example', icon: '', json: { visible: true } },
    ])))
    backup.lists = backup.lists.filter((item: { id: string }) => item.id !== 'builtin-sns')

    const parsed = parseBookmarksBackup(JSON.stringify(backup))

    expect(parsed).not.toBeNull()
    expect(parsed!.bookmarks.some((item) => item.id === 'mine')).toBe(true)
  })

  it('tombstones rows the backup omits instead of dropping them', () => {
    const currentLists = normalizeLists([
      { id: 'kept', name: 'Kept', json: { visible: true, sort_index: 0 } },
      { id: 'dropped', name: 'Dropped', json: { visible: true, sort_index: 1 } },
    ])
    const currentBookmarks = normalizeBookmarks(currentLists, [
      { id: 'kept-b', listId: 'kept', title: 'Kept', url: 'https://kept.example', icon: '', json: { visible: true } },
      { id: 'dropped-b', listId: 'dropped', title: 'Dropped', url: 'https://dropped.example', icon: '', json: { visible: true } },
    ])

    const backup = {
      lists: currentLists.filter((item) => item.id === 'kept'),
      bookmarks: currentBookmarks.filter((item) => item.id === 'kept-b'),
    }

    const next = applyBookmarkBackup(currentLists, currentBookmarks, backup, '2026-08-16T00:00:00.000Z')

    // Still present as rows, so the sync watcher marks them pending and pushes
    // the tombstones rather than letting the remote copies come back.
    const droppedList = next.lists.find((item) => item.id === 'dropped')
    expect(droppedList?.json.deleted_at).toBe('2026-08-16T00:00:00.000Z')
    expect(droppedList?.json.visible).toBe(false)
    expect(droppedList?.updatedAt).toBe('2026-08-16T00:00:00.000Z')

    const droppedBookmark = next.bookmarks.find((item) => item.id === 'dropped-b')
    expect(droppedBookmark?.json.deleted_at).toBe('2026-08-16T00:00:00.000Z')

    expect(next.lists.find((item) => item.id === 'kept')?.json.deleted_at).toBeNull()
    expect(next.bookmarks.find((item) => item.id === 'kept-b')?.json.deleted_at).toBeNull()
  })

  it('keeps existing tombstones untouched when restoring', () => {
    const currentLists = normalizeLists([
      { id: 'kept', name: 'Kept', json: { visible: true } },
      { id: 'old', name: 'Old', json: { visible: false, deleted_at: '2026-01-01T00:00:00.000Z' } },
    ])

    const next = applyBookmarkBackup(
      currentLists,
      [],
      { lists: currentLists.filter((item) => item.id === 'kept'), bookmarks: [] },
      '2026-08-16T00:00:00.000Z',
    )

    expect(next.lists.find((item) => item.id === 'old')?.json.deleted_at).toBe('2026-01-01T00:00:00.000Z')
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

  it('maps subfolders to tags across nested DT wrappers (real Chrome export shape)', () => {
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
    expect(result[0].listName).toBe('Outer')
    expect(result[0].tags).toEqual(['Inner'])
  })

  it('keeps every nesting level below the list as tags', () => {
    const html = `
      <DL><p>
        <DT><H3>Bookmarks bar</H3>
        <DL><p>
          <DT><H3>Dev</H3>
          <DL><p>
            <DT><A HREF="https://dev.example/">Dev root</A>
            <DT><H3>Tools</H3>
            <DL><p>
              <DT><H3>Editors</H3>
              <DL><p>
                <DT><A HREF="https://editor.example/">Editor</A>
              </DL><p>
            </DL><p>
          </DL><p>
        </DL><p>
      </DL><p>
    `

    const result = parseBookmarksForImport(html, 'html')
    expect(result).toEqual([
      { listName: 'Dev', title: 'Dev root', url: 'https://dev.example/' },
      { listName: 'Dev', title: 'Editor', url: 'https://editor.example/', tags: ['Tools', 'Editors'] },
    ])
  })

  it('keeps the browser root folder as the list when nothing is nested below it', () => {
    const html = `
      <DL><p>
        <DT><H3>Bookmarks bar</H3>
        <DL><p>
          <DT><A HREF="https://top.example/">Top</A>
        </DL><p>
      </DL><p>
    `

    const result = parseBookmarksForImport(html, 'html')
    expect(result).toEqual([
      { listName: 'Bookmarks bar', title: 'Top', url: 'https://top.example/' },
    ])
  })

  it('keeps a user folder that shares a browser root name', () => {
    const html = `
      <DL><p>
        <DT><H3>Bookmarks bar</H3>
        <DL><p>
          <DT><H3>Favorites</H3>
          <DL><p>
            <DT><H3>Work</H3>
            <DL><p>
              <DT><A HREF="https://work.example/">Work</A>
            </DL><p>
          </DL><p>
        </DL><p>
      </DL><p>
    `

    const result = parseBookmarksForImport(html, 'html')
    expect(result).toEqual([
      { listName: 'Favorites', title: 'Work', url: 'https://work.example/', tags: ['Work'] },
    ])
  })

  it('imports subfolder tags onto merged bookmarks', () => {
    const result = mergeImportedBookmarks(normalizeLists([]), [], [
      { listName: 'Dev', title: 'Editor', url: 'https://editor.example/', tags: ['Tools', 'Editors'] },
      { listName: 'Dev', title: 'Plain', url: 'https://plain.example/' },
    ])

    expect(result.importedCount).toBe(2)
    const imported = result.bookmarks.find((item) => item.url === 'https://editor.example/')
    expect(imported?.json.tags).toEqual(['Tools', 'Editors'])
    expect(result.bookmarks.find((item) => item.url === 'https://plain.example/')?.json.tags).toBeUndefined()
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
