import { StrictMode, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import { getAllTags, getTags } from 'nori/lib/nori-data'
import '../../lib/i18n'
import '../../styles.css'
import './popup.css'
import { request, openManager } from '../../lib/client'
import { isDeleted, isVisible, liveBookmarks, liveLists, tagsOf } from '../../lib/domain'
import { useSnapshot } from '../../components/useSnapshot'
import { Favicon } from '../../components/Favicon'
import type { BookmarkDraft, NoriBookmark, NoriList } from '../../lib/model'

type IconName =
  | 'bookmarks'
  | 'history'
  | 'more'
  | 'plus'
  | 'search'
  | 'edit'
  | 'up'
  | 'close'
  | 'check'
  | 'checkbox'
  | 'checkboxEmpty'
  | 'move'
  | 'hide'
  | 'share'
  | 'delete'
  | 'copy'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    bookmarks: (
      <path
        fill="currentColor"
        stroke="none"
        d="M19 18l2 1V3c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2h10c1.1 0 2 .9 2 2v13zM15 5H5c-1.1 0-2 .9-2 2v16l7-3 7 3V7c0-1.1-.9-2-2-2z"
      />
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" />
        <path d="M4 4v4.7h4.7M12 7.5V12l3 1.8" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16Z" />
        <path d="m14.7 6.5 3 3" />
      </>
    ),
    up: <path d="m7 14 5-5 5 5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4 10-10" />,
    checkbox: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m7.5 12 3 3 6-6" />
      </>
    ),
    checkboxEmpty: <rect x="4" y="4" width="16" height="16" rx="2" />,
    move: (
      <>
        <path d="M4 7h7l2 2h7v9H4z" />
        <path d="m11 13 2-2 2 2M13 11v5" />
      </>
    ),
    hide: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-2.1 3.1M6.6 6.6C4.3 8.1 3 12 3 12s3.5 7 9 7a9 9 0 0 0 3-.5" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m8 11 8-5M8 13l8 5" />
      </>
    ),
    delete: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function BookmarkEditor({
  bookmark,
  initial,
  lists,
  allBookmarks,
  onClose,
  onSaved,
}: {
  bookmark?: NoriBookmark
  initial?: Partial<BookmarkDraft>
  lists: NoriList[]
  allBookmarks: NoriBookmark[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<BookmarkDraft>({
    listId: bookmark?.listId || initial?.listId || lists[0]?.id || '',
    url: bookmark?.url || initial?.url || '',
    title: bookmark?.title || initial?.title || '',
    icon: bookmark?.icon || initial?.icon || '',
    tags: bookmark ? getTags(bookmark) : initial?.tags || [],
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const suggestions = getAllTags(allBookmarks)
    .filter(
      (tag) =>
        !draft.tags?.some((item) => item.toLowerCase() === tag.toLowerCase()) &&
        (!tagInput.trim() || tag.toLowerCase().includes(tagInput.trim().toLowerCase())),
    )
    .slice(0, 8)
  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (!tag || draft.tags?.some((item) => item.toLowerCase() === tag.toLowerCase())) return
    setDraft((current) => ({ ...current, tags: [...(current.tags || []), tag] }))
  }
  const changeTagInput = (value: string) => {
    if (!/[,\s]/.test(value)) return setTagInput(value)
    const parts = value.split(/[,\s]+/)
    const remainder = parts.pop() || ''
    parts.forEach(addTag)
    setTagInput(remainder)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const tags = [...(draft.tags || [])]
      if (tagInput.trim()) tags.push(tagInput.trim())
      if (bookmark) await request({ type: 'update-bookmark', id: bookmark.id, draft: { ...draft, tags } })
      else await request({ type: 'save-bookmark', draft: { ...draft, tags } })
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setSaving(false)
    }
  }
  return (
    <div className="popup-modal" role="dialog" aria-modal="true">
      <form className="popup-dialog" onSubmit={(event) => void submit(event)}>
        <header className="flex items-center justify-between">
          <h2 className="m-0 text-xl font-semibold">{bookmark ? t('editBookmark') : t('addBookmark')}</h2>
          <button type="button" className="round-action" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="grid gap-3">
          <input
            autoFocus={!bookmark}
            className="editor-field"
            required
            type="url"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder={t('url')}
          />
          <input
            className="editor-field"
            value={draft.title || ''}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder={t('titleOptional')}
          />
        </div>
        <div className="grid gap-2">
          {!!draft.tags?.length && (
            <div className="flex flex-wrap gap-2">
              {draft.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-token"
                  onClick={() => setDraft({ ...draft, tags: draft.tags?.filter((item) => item !== tag) })}
                >
                  {tag}
                  <Icon name="close" size={13} />
                </button>
              ))}
            </div>
          )}
          <input
            className="editor-field"
            value={tagInput}
            onChange={(event) => changeTagInput(event.target.value)}
            onBlur={() => {
              addTag(tagInput)
              setTagInput('')
            }}
            placeholder={t('addTag')}
          />
          {!!suggestions.length && (
            <div className="list-chips flex gap-2 overflow-x-auto">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="suggestion-chip"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    addTag(tag)
                    setTagInput('')
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="list-chips flex gap-3 overflow-x-auto">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`list-chip ${draft.listId === list.id ? 'active' : ''}`}
              onClick={() => setDraft({ ...draft, listId: list.id })}
            >
              {list.name}
            </button>
          ))}
        </div>
        {error && <p className="m-0 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <footer className="flex justify-end gap-3">
          <button type="button" className="dialog-button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="dialog-button primary" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Popup() {
  const { t, i18n } = useTranslation()
  const { snapshot, error, refresh, setError } = useSnapshot()
  const [tab, setTab] = useState<{ url: string; title: string; favIconUrl?: string }>({ url: '', title: '' })
  const [listId, setListId] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string>()
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [editor, setEditor] = useState<NoriBookmark | 'new'>()
  const [menuId, setMenuId] = useState<string>()
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void }>()
  const orderRef = useRef<string[]>([])

  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) =>
        setTab({ url: active?.url || '', title: active?.title || '', favIconUrl: active?.favIconUrl }),
      )
  }, [])
  useEffect(() => {
    if (!snapshot) return
    void i18n.changeLanguage(snapshot.preferences.language)
    const dark =
      snapshot.preferences.theme === 'dark' ||
      (snapshot.preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    const available = liveLists(snapshot.profile)
    setListId((current) =>
      available.some((list) => list.id === current)
        ? current
        : snapshot.preferences.lastListId || available[0]?.id || '',
    )
  }, [snapshot, i18n])

  const lists = useMemo(() => (snapshot ? liveLists(snapshot.profile) : []), [snapshot])
  const selectedList = lists.find((list) => list.id === listId) || lists[0]
  const selectedListId = selectedList?.id
  const bookmarks = useMemo(() => (snapshot ? liveBookmarks(snapshot.profile) : []), [snapshot])
  const listBookmarks = useMemo(
    () => bookmarks.filter((item) => item.listId === selectedListId),
    [bookmarks, selectedListId],
  )
  const hiddenBookmarks = useMemo(
    () =>
      snapshot?.profile.bookmarks
        .filter((item) => item.listId === selectedListId && !isDeleted(item) && !isVisible(item))
        .sort((a, b) => Number(a.json.sort_index || 0) - Number(b.json.sort_index || 0)) || [],
    [snapshot, selectedListId],
  )
  useEffect(() => {
    const ids = listBookmarks.map((item) => item.id)
    setOrderedIds(ids)
    orderRef.current = ids
  }, [listBookmarks])
  useEffect(() => {
    setSelectedIds([])
    setMoveMenuOpen(false)
  }, [selectedListId])

  const shownBookmarks = useMemo(() => {
    if (editMode) {
      const byId = new Map(listBookmarks.map((item) => [item.id, item]))
      return orderedIds.map((id) => byId.get(id)).filter(Boolean) as NoriBookmark[]
    }
    const normalized = query.trim().toLowerCase()
    return normalized
      ? bookmarks.filter((item) =>
          `${item.title} ${item.url} ${tagsOf(item).join(' ')}`.toLowerCase().includes(normalized),
        )
      : listBookmarks
  }, [bookmarks, editMode, listBookmarks, orderedIds, query])

  const selectList = async (nextListId: string) => {
    if (editMode) return
    setListId(nextListId)
    await request({ type: 'set-preferences', preferences: { lastListId: nextListId } })
  }
  const mutate = async (message: Parameters<typeof request>[0]) => {
    try {
      await request(message)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const open = async (bookmark: NoriBookmark) => {
    await request({ type: 'open-bookmark', id: bookmark.id })
    await browser.tabs.create({ url: bookmark.url })
  }
  const toggleEditMode = () => {
    setEditMode((current) => !current)
    setSelectedIds([])
    setMoveMenuOpen(false)
    setQuery('')
    setSearchOpen(false)
    setMenuId(undefined)
  }
  const toggleSelected = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const showNotice = (message: string, undo?: () => void) => {
    setSnackbar({ message, undo })
    window.setTimeout(() => setSnackbar(undefined), 5000)
  }
  const hideSelected = async () => {
    const ids = [...selectedIds]
    await mutate({ type: 'set-bookmark-visibility', ids, visible: false })
    setSelectedIds([])
    showNotice(t('hidden'), () => void mutate({ type: 'set-bookmark-visibility', ids, visible: true }))
  }
  const deleteSelected = async () => {
    if (!confirm(t('confirmDeleteBookmarks', { count: selectedIds.length }))) return
    const ids = [...selectedIds]
    await mutate({ type: 'delete-bookmarks', ids })
    setSelectedIds([])
    showNotice(t('deletedBookmarks', { count: ids.length }), () => void mutate({ type: 'restore-bookmarks', ids }))
  }
  const moveSelected = async (targetListId: string) => {
    const ids = [...selectedIds]
    await mutate({ type: 'move-bookmarks', ids, listId: targetListId })
    setSelectedIds([])
    setMoveMenuOpen(false)
    showNotice(t('movedBookmarks', { count: ids.length }))
  }
  const shareSelected = async () => {
    const urls = bookmarks.filter((item) => selectedIds.includes(item.id)).map((item) => item.url)
    if (!urls.length) return
    try {
      if (navigator.share) await navigator.share({ text: urls.join('\n') })
      else {
        await navigator.clipboard.writeText(urls.join('\n'))
        showNotice(t('copied'))
      }
    } catch {
      /* share dismissed */
    }
  }
  const deleteOne = async (bookmark: NoriBookmark) => {
    if (!confirm(`${t('delete')} “${bookmark.title}”?`)) return
    await mutate({ type: 'delete-bookmark', id: bookmark.id })
    showNotice(
      t('deletedBookmarks', { count: 1 }),
      () => void mutate({ type: 'restore-bookmarks', ids: [bookmark.id] }),
    )
  }
  const reorderOver = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    if (!draggingId || draggingId === targetId) return
    setOrderedIds((current) => {
      const from = current.indexOf(draggingId)
      const to = current.indexOf(targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      next.splice(from, 1)
      next.splice(to, 0, draggingId)
      orderRef.current = next
      return next
    })
  }
  const finishDrag = () => {
    setDraggingId(undefined)
    if (selectedList) void mutate({ type: 'reorder-bookmarks', listId: selectedList.id, ids: orderRef.current })
  }

  if (!snapshot)
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
        <img className="h-12 w-12 rounded-2xl" src="/icon.png" alt="" />
        <p className={error ? 'text-xs text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}>
          {error || 'Loading…'}
        </p>
      </main>
    )

  return (
    <main
      className="relative flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50"
      onClick={() => menuId && setMenuId(undefined)}
    >
      {!editMode && (
        <header className="flex items-center justify-between px-6 pb-2 pt-5">
          <button className="header-action" onClick={() => void openManager('bookmarks')} aria-label={t('bookmarks')}>
            <Icon name="bookmarks" />
          </button>
          <div className="flex items-center gap-4">
            <button className="header-action" onClick={() => void openManager('history')} aria-label={t('history')}>
              <Icon name="history" />
            </button>
            <button className="header-action" onClick={() => void openManager('settings')} aria-label={t('manager')}>
              <Icon name="more" />
            </button>
          </div>
        </header>
      )}
      <nav
        className={`list-chips flex shrink-0 gap-3 overflow-x-auto px-6 pb-2 ${editMode ? 'pt-5' : 'pt-4'}`}
        aria-label={t('lists')}
      >
        {lists.map((list) => (
          <button
            key={list.id}
            className={`list-chip ${list.id === selectedList?.id ? 'active' : ''}`}
            onClick={() => void selectList(list.id)}
          >
            {list.name}
          </button>
        ))}
        {!editMode && (
          <button className="new-list-chip" onClick={() => void openManager('lists')}>
            <Icon name="plus" size={15} />
            {t('newList')}
          </button>
        )}
      </nav>
      {searchOpen && !editMode && (
        <div className="search-box">
          <Icon name="search" size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
          <button
            onClick={() => {
              setQuery('')
              setSearchOpen(false)
            }}
            aria-label={t('close')}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      <section className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-6">
        {editMode && (
          <div className="edit-hint">
            <span>
              <Icon name="edit" size={16} />
            </span>
            <div>
              <strong>{t('editingBookmarks')}</strong>
              <small>{t('editHint')}</small>
            </div>
          </div>
        )}
        {shownBookmarks.length ? (
          <div className="bookmark-grid">
            {shownBookmarks.map((bookmark) => (
              <div
                className={`bookmark-wrap ${draggingId === bookmark.id ? 'dragging' : ''}`}
                key={bookmark.id}
                draggable={editMode}
                onDragStart={(event) => {
                  setDraggingId(bookmark.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', bookmark.id)
                }}
                onDragOver={(event) => reorderOver(event, bookmark.id)}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={finishDrag}
              >
                <button
                  className={`bookmark-pill ${selectedIds.includes(bookmark.id) ? 'selected' : ''}`}
                  onClick={() => (editMode ? toggleSelected(bookmark.id) : void open(bookmark))}
                  onContextMenu={(event) => {
                    if (editMode) return
                    event.preventDefault()
                    setMenuId(bookmark.id)
                  }}
                  title={bookmark.url}
                >
                  <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} />
                  <span>{bookmark.title}</span>
                  {selectedIds.includes(bookmark.id) && (
                    <span className="selection-check">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </button>
                {!editMode && (
                  <button
                    className="tile-menu-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setMenuId(menuId === bookmark.id ? undefined : bookmark.id)
                    }}
                    aria-label={t('bookmarkActions')}
                  >
                    <Icon name="more" size={15} />
                  </button>
                )}
                {menuId === bookmark.id && (
                  <div className="bookmark-menu" onClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditor(bookmark)
                        setMenuId(undefined)
                      }}
                    >
                      <Icon name="edit" size={16} />
                      {t('edit')}
                    </button>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(bookmark.url)
                        showNotice(t('copied'))
                        setMenuId(undefined)
                      }}
                    >
                      <Icon name="copy" size={16} />
                      {t('copy')}
                    </button>
                    <button
                      onClick={() => {
                        void deleteOne(bookmark)
                        setMenuId(undefined)
                      }}
                      className="danger"
                    >
                      <Icon name="delete" size={16} />
                      {t('delete')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span>
              <Icon name="bookmarks" size={25} />
            </span>
            <strong>{t('noBookmarks')}</strong>
            {!query && <small>{selectedList?.name}</small>}
          </div>
        )}
        {editMode && hiddenBookmarks.length > 0 && (
          <div className="mt-7">
            <div className="mb-3">
              <strong className="block text-sm">{t('hiddenInList')}</strong>
              <small className="text-stone-500">{t('hiddenHint')}</small>
            </div>
            <div className="bookmark-grid">
              {hiddenBookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  className="bookmark-pill opacity-60"
                  onClick={() => void mutate({ type: 'set-bookmark-visibility', ids: [bookmark.id], visible: true })}
                >
                  <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} />
                  <span>{bookmark.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <footer className="floating-toolbar">
        {editMode ? (
          selectedIds.length ? (
            <>
              <button
                className="selection-count"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === listBookmarks.length ? [] : listBookmarks.map((item) => item.id),
                  )
                }
              >
                <Icon name={selectedIds.length === listBookmarks.length ? 'checkbox' : 'checkboxEmpty'} size={19} />
                {selectedIds.length}
              </button>
              <div className="relative">
                <button
                  className="toolbar-action"
                  onClick={() => setMoveMenuOpen((open) => !open)}
                  aria-label={t('moveTo')}
                >
                  <Icon name="move" />
                </button>
                {moveMenuOpen && (
                  <div className="move-menu">
                    {lists
                      .filter((list) => list.id !== selectedList?.id)
                      .map((list) => (
                        <button key={list.id} onClick={() => void moveSelected(list.id)}>
                          {list.name}
                        </button>
                      ))}
                    {lists.length < 2 && <span>{t('noOtherLists')}</span>}
                  </div>
                )}
              </div>
              <button className="toolbar-action" onClick={() => void hideSelected()} aria-label={t('hide')}>
                <Icon name="hide" />
              </button>
              <button className="toolbar-action" onClick={() => void shareSelected()} aria-label={t('share')}>
                <Icon name="share" />
              </button>
              <button className="toolbar-action danger" onClick={() => void deleteSelected()} aria-label={t('delete')}>
                <Icon name="delete" />
              </button>
              <button className="toolbar-action done" onClick={toggleEditMode} aria-label={t('doneEditing')}>
                <Icon name="check" />
              </button>
            </>
          ) : (
            <>
              <button
                className="select-all"
                onClick={() => setSelectedIds(listBookmarks.map((item) => item.id))}
                disabled={!listBookmarks.length}
              >
                {t('selectAll')}
              </button>
              <span className="flex-1" />
              <button className="toolbar-action done" onClick={toggleEditMode} aria-label={t('doneEditing')}>
                <Icon name="check" />
              </button>
            </>
          )
        ) : (
          <>
            <button className="toolbar-action" onClick={() => setEditor('new')} aria-label={t('savePage')}>
              <Icon name="plus" />
            </button>
            <button className="search-handle" onClick={() => setSearchOpen((open) => !open)} aria-label={t('search')}>
              <span />
              <Icon name="up" size={22} />
            </button>
            <button className="toolbar-action" onClick={toggleEditMode} aria-label={t('edit')}>
              <Icon name="edit" size={18} />
            </button>
          </>
        )}
      </footer>
      {editor && (
        <BookmarkEditor
          bookmark={editor === 'new' ? undefined : editor}
          initial={
            editor === 'new'
              ? { listId: selectedList?.id, url: tab.url, title: tab.title, icon: tab.favIconUrl }
              : undefined
          }
          lists={lists}
          allBookmarks={bookmarks}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined)
            void refresh()
            showNotice(editor === 'new' ? t('saved') : t('updated'))
          }}
        />
      )}
      {snackbar && (
        <div className="snackbar">
          <span>{snackbar.message}</span>
          {snackbar.undo && (
            <button
              onClick={() => {
                snackbar.undo?.()
                setSnackbar(undefined)
              }}
            >
              {t('undo')}
            </button>
          )}
          <button onClick={() => setSnackbar(undefined)} aria-label={t('close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
