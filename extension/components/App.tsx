import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import { systemLanguage } from '../lib/language'
import { AppProvider, useApp } from './AppContext'
import { useSnapshot } from './useSnapshot'
import { Icon } from './Icon'
import { Snackbars, showSnackbar } from './Snackbar'
import { BookmarkGrid, type BookmarkHandlers } from './parts/BookmarkGrid'
import { BookmarkEditor } from './parts/BookmarkEditor'
import { Header } from './parts/Header'
import { HistorySheet } from './parts/HistorySheet'
import { ListEditor } from './parts/ListEditor'
import { ListsSheet } from './parts/ListsSheet'
import { SearchDrawer } from './parts/SearchDrawer'
import { SettingsSheet } from './parts/SettingsSheet'
import { Toolbar } from './parts/Toolbar'
import type { BookmarkDraft, NoriBookmark, NoriList } from '../lib/model'

/** Where the same UI is mounted: the browser action popup, or the standalone tab. */
export type AppMode = 'popup' | 'tab'

interface ActiveTab {
  url: string
  title: string
  favIconUrl?: string
}

type Overlay = 'drawer' | 'history' | 'lists' | 'settings' | null
type Editor =
  { kind: 'bookmark'; bookmark?: NoriBookmark; initial?: Partial<BookmarkDraft> } | { kind: 'list'; list?: NoriList }

function Home({ mode, tab }: { mode: AppMode; tab: ActiveTab }) {
  const { t } = useTranslation()
  const { snapshot, lists, bookmarks, mutate, refresh } = useApp()
  const [listId, setListId] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [drawerFilterListId, setDrawerFilterListId] = useState('all')
  const [editor, setEditor] = useState<Editor>()

  useEffect(() => {
    setListId((current) =>
      lists.some((list) => list.id === current) ? current : snapshot.preferences.lastListId || lists[0]?.id || '',
    )
  }, [lists, snapshot.preferences.lastListId])

  const selectedList = lists.find((list) => list.id === listId) || lists[0]
  const listBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => bookmark.listId === selectedList?.id),
    [bookmarks, selectedList?.id],
  )

  useEffect(() => {
    setSelectedIds([])
  }, [selectedList?.id, editMode])

  const openBookmark = useCallback(
    async (bookmark: NoriBookmark) => {
      await mutate({ type: 'open-bookmark', id: bookmark.id })
      await browser.tabs.create({ url: bookmark.url })
    },
    [mutate],
  )

  // Same UI, its own tab: handy while sorting a lot of bookmarks, since the
  // popup closes the moment focus leaves it.
  const openInTab = useCallback(async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/tab.html') })
    window.close()
  }, [])

  const deleteBookmark = useCallback(
    async (bookmark: NoriBookmark) => {
      await mutate({ type: 'delete-bookmark', id: bookmark.id })
      showSnackbar(t('deleted'), t('undo'), () => void mutate({ type: 'restore-bookmarks', ids: [bookmark.id] }))
    },
    [mutate, t],
  )

  const shareUrls = useCallback(
    async (urls: string[]) => {
      if (!urls.length) return
      try {
        if (navigator.share) await navigator.share({ text: urls.join('\n') })
        else {
          await navigator.clipboard.writeText(urls.join('\n'))
          showSnackbar(t('copied'))
        }
      } catch {
        /* share dismissed */
      }
    },
    [t],
  )

  const handlers: BookmarkHandlers = useMemo(
    () => ({
      onOpen: (bookmark) => void openBookmark(bookmark),
      onEdit: (bookmark) => {
        setOverlay(null)
        setEditor({ kind: 'bookmark', bookmark })
      },
      onCopyUrl: (bookmark) => {
        void navigator.clipboard.writeText(bookmark.url)
        showSnackbar(t('copied'))
      },
      onShare: (bookmark) => void shareUrls([bookmark.url]),
      onDelete: (bookmark) => void deleteBookmark(bookmark),
    }),
    [deleteBookmark, openBookmark, shareUrls, t],
  )

  const selectList = async (nextListId: string) => {
    if (editMode) return
    setListId(nextListId)
    await mutate({ type: 'set-preferences', preferences: { lastListId: nextListId } })
  }

  const toggleEditMode = () => {
    setEditMode((current) => !current)
    setSelectedIds([])
    setOverlay(null)
  }

  const allSelected = listBookmarks.length > 0 && listBookmarks.every((item) => selectedIds.includes(item.id))

  const hideSelected = async () => {
    const ids = [...selectedIds]
    await mutate({ type: 'set-bookmark-visibility', ids, visible: false })
    setSelectedIds([])
    showSnackbar(t('hidden'), t('undo'), () => void mutate({ type: 'set-bookmark-visibility', ids, visible: true }))
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (!confirm(t('confirmDeleteBookmarks', { count: ids.length }))) return
    await mutate({ type: 'delete-bookmarks', ids })
    setSelectedIds([])
    showSnackbar(
      t('deletedBookmarks', { count: ids.length }),
      t('undo'),
      () => void mutate({ type: 'restore-bookmarks', ids }),
    )
  }

  const moveSelected = async (targetListId: string) => {
    const ids = [...selectedIds]
    await mutate({ type: 'move-bookmarks', ids, listId: targetListId })
    setSelectedIds([])
    showSnackbar(t('movedBookmarks', { count: ids.length }))
  }

  return (
    <>
      {!editMode && (
        <Header
          hasList={!!selectedList}
          editMode={editMode}
          onOpenDrawer={() => setOverlay('drawer')}
          onOpenHistory={() => setOverlay('history')}
          onOpenLists={() => setOverlay('lists')}
          onOpenSettings={() => setOverlay('settings')}
          onToggleEdit={toggleEditMode}
          onOpenInTab={mode === 'popup' ? () => void openInTab() : undefined}
        />
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
          <button className="new-list-chip" onClick={() => setEditor({ kind: 'list' })}>
            <Icon name="add" size={15} />
            {t('newList')}
          </button>
        )}
      </nav>
      <BookmarkGrid
        list={selectedList}
        editMode={editMode}
        selectedIds={selectedIds}
        onToggleSelected={(id) =>
          setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
        }
        handlers={handlers}
        onOverscroll={() => setOverlay('drawer')}
      />
      <Toolbar
        editMode={editMode}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        hasBookmarks={listBookmarks.length > 0}
        moveTargets={lists.filter((list) => list.id !== selectedList?.id)}
        onNew={() =>
          setEditor({
            kind: 'bookmark',
            initial: { listId: selectedList?.id, url: tab.url, title: tab.title, icon: tab.favIconUrl },
          })
        }
        onOpenDrawer={() => setOverlay('drawer')}
        onToggleEdit={toggleEditMode}
        onSelectAll={() => setSelectedIds(allSelected ? [] : listBookmarks.map((item) => item.id))}
        onHide={() => void hideSelected()}
        onMove={(targetListId) => void moveSelected(targetListId)}
        onShare={() =>
          void shareUrls(bookmarks.filter((item) => selectedIds.includes(item.id)).map((item) => item.url))
        }
        onDelete={() => void deleteSelected()}
      />

      {overlay === 'drawer' && (
        <SearchDrawer
          filterListId={drawerFilterListId}
          setFilterListId={setDrawerFilterListId}
          onClose={() => setOverlay(null)}
          handlers={handlers}
        />
      )}
      {overlay === 'history' && (
        <HistorySheet
          onClose={() => setOverlay(null)}
          onOpenBookmark={(bookmark) => {
            setOverlay(null)
            void openBookmark(bookmark)
          }}
          onOpenUrl={(item) => {
            setOverlay(null)
            void browser.tabs.create({ url: item.url })
          }}
        />
      )}
      {overlay === 'lists' && (
        <ListsSheet
          onClose={() => setOverlay(null)}
          onNewList={() => setEditor({ kind: 'list' })}
          onRenameList={(list) => setEditor({ kind: 'list', list })}
        />
      )}
      {overlay === 'settings' && <SettingsSheet onClose={() => setOverlay(null)} />}

      {editor?.kind === 'bookmark' && (
        <BookmarkEditor
          bookmark={editor.bookmark}
          initial={editor.initial}
          onSaved={(savedListId) => setListId(savedListId)}
          onClose={() => setEditor(undefined)}
        />
      )}
      {editor?.kind === 'list' && (
        <ListEditor
          list={editor.list}
          onClose={() => {
            setEditor(undefined)
            void refresh()
          }}
        />
      )}
      <Snackbars raised={!overlay} />
    </>
  )
}

export function App({ mode }: { mode: AppMode }) {
  const { i18n } = useTranslation()
  const { snapshot, error, refresh, setError } = useSnapshot()
  const [tab, setTab] = useState<ActiveTab>({ url: '', title: '' })

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      // Only pages the user could actually revisit are worth prefilling. In tab
      // mode the active tab is this manager itself, and in the popup it can be
      // an internal page, so anything that is not http(s) starts an empty draft.
      if (!/^https?:/i.test(active?.url || '')) return
      setTab({ url: active!.url!, title: active?.title || '', favIconUrl: active?.favIconUrl })
    })
  }, [])

  useEffect(() => {
    if (!snapshot) return
    void i18n.changeLanguage(snapshot.preferences.language || systemLanguage())
    const dark =
      snapshot.preferences.theme === 'dark' ||
      (snapshot.preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }, [snapshot, i18n])

  if (!snapshot)
    return (
      <main className="app-shell items-center justify-center gap-3">
        <img className="h-12 w-12 rounded-2xl" src="/icon.png" alt="" />
        <p className={error ? 'text-xs text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}>
          {error || 'Loading…'}
        </p>
      </main>
    )

  return (
    <main className="app-shell">
      <AppProvider value={{ snapshot, refresh, setError }}>
        <Home mode={mode} tab={tab} />
      </AppProvider>
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="close">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </main>
  )
}
