import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import '../../lib/i18n'
import '../../styles.css'
import './popup.css'
import { request, openManager } from '../../lib/client'
import { liveBookmarks, liveLists, tagsOf } from '../../lib/domain'
import { useSnapshot } from '../../components/useSnapshot'
import { Favicon } from '../../components/Favicon'

type IconName = 'bookmarks' | 'history' | 'more' | 'plus' | 'search' | 'edit' | 'up' | 'close'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    bookmarks: <path fill="currentColor" stroke="none" d="M19 18l2 1V3c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2h10c1.1 0 2 .9 2 2v13zM15 5H5c-1.1 0-2 .9-2 2v16l7-3 7 3V7c0-1.1-.9-2-2-2z" />,
    history: <><path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.7" /><path d="M4 4v4.7h4.7M12 7.5V12l3 1.8" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    edit: <><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16Z" /><path d="m14.7 6.5 3 3" /></>,
    up: <path d="m7 14 5-5 5 5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function Popup() {
  const { t, i18n } = useTranslation()
  const { snapshot, error, refresh, setError } = useSnapshot()
  const [tab, setTab] = useState<{ url: string; title: string; favIconUrl?: string }>({ url: '', title: '' })
  const [listId, setListId] = useState('')
  const [tags, setTags] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => setTab({
      url: active?.url || '',
      title: active?.title || '',
      favIconUrl: active?.favIconUrl,
    }))
  }, [])
  useEffect(() => {
    if (!snapshot) return
    setListId(snapshot.preferences.lastListId || liveLists(snapshot.profile)[0]?.id || '')
    void i18n.changeLanguage(snapshot.preferences.language)
  }, [snapshot, i18n])

  const lists = snapshot ? liveLists(snapshot.profile) : []
  const selectedList = lists.find((list) => list.id === listId) || lists[0]
  const bookmarks = snapshot ? liveBookmarks(snapshot.profile) : []
  const shownBookmarks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized) return bookmarks.filter((item) => `${item.title} ${item.url} ${tagsOf(item).join(' ')}`.toLowerCase().includes(normalized))
    return bookmarks.filter((item) => item.listId === selectedList?.id)
  }, [bookmarks, query, selectedList?.id])

  const selectList = async (nextListId: string) => {
    setListId(nextListId)
    await request({ type: 'set-preferences', preferences: { lastListId: nextListId } })
  }
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await request({ type: 'save-bookmark', draft: { listId, url: tab.url, title: tab.title, icon: tab.favIconUrl, tags: tags.split(',') } })
      await request({ type: 'set-preferences', preferences: { lastListId: listId } })
      setSaved(true)
      await refresh()
      window.setTimeout(() => setComposerOpen(false), 500)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }
  const open = async (id: string, url: string) => {
    await request({ type: 'open-bookmark', id })
    await browser.tabs.create({ url })
  }

  if (!snapshot) return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <img className="h-12 w-12 rounded-2xl" src="/icon.png" alt="" />
      <p className={error ? 'text-xs text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}>{error || 'Loading…'}</p>
    </main>
  )

  const current = { title: tab.title || t('currentPage'), url: tab.url, icon: tab.favIconUrl || '' }
  return <main className="relative flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
    <header className="flex items-center justify-between px-6 pb-2 pt-5">
      <button className="grid h-10 w-10 place-items-center rounded-full border border-stone-300 bg-stone-100 text-stone-800 transition hover:bg-stone-200 active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50 dark:hover:bg-stone-700" onClick={() => void openManager()} aria-label={t('bookmarks')}><Icon name="bookmarks" /></button>
      <div className="flex items-center gap-4">
        <button className="grid h-10 w-10 place-items-center rounded-full border border-stone-300 bg-stone-100 text-stone-800 transition hover:bg-stone-200 active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50 dark:hover:bg-stone-700" onClick={() => void openManager()} aria-label={t('history')}><Icon name="history" /></button>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-stone-300 bg-stone-100 text-stone-800 transition hover:bg-stone-200 active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-50 dark:hover:bg-stone-700" onClick={() => void openManager()} aria-label={t('manager')}><Icon name="more" /></button>
      </div>
    </header>

    <nav className="list-chips flex shrink-0 gap-3 overflow-x-auto px-6 pb-2 pt-4" aria-label={t('lists')}>
      {lists.map((list) => <button
        key={list.id}
        className={`flex h-8 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition ${list.id === selectedList?.id
          ? 'border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
          : 'border-stone-200 bg-transparent text-stone-600 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900'}`}
        onClick={() => void selectList(list.id)}
      >{list.name}</button>)}
      <button className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-stone-200 bg-transparent px-4 text-sm font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900" onClick={() => void openManager()}><Icon name="plus" size={15} />{t('newList')}</button>
    </nav>

    {searchOpen && <div className="mx-6 mt-3 flex h-11 shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-stone-500 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
      <Icon name="search" size={18} />
      <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-50" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
      <button className="grid place-items-center border-0 bg-transparent p-1 text-stone-500" onClick={() => { setQuery(''); setSearchOpen(false) }} aria-label={t('close')}><Icon name="close" size={17} /></button>
    </div>}

    <section className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-6">
      {shownBookmarks.length ? <div className="grid grid-cols-2 gap-4">{shownBookmarks.map((bookmark) => <button className="bookmark-pill flex h-[46px] min-w-0 items-center gap-2 overflow-hidden rounded-full border border-stone-200 bg-white px-3 text-left text-sm font-medium text-stone-800 transition hover:bg-stone-100 active:scale-[0.98] dark:border-stone-800 dark:bg-stone-900 dark:text-stone-50 dark:hover:bg-stone-800" key={bookmark.id} onClick={() => void open(bookmark.id, bookmark.url)} title={bookmark.url}>
        <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} />
        <span className="min-w-0 flex-1 truncate">{bookmark.title}</span>
      </button>)}</div> : <div className="flex h-full min-h-52 flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
        <span className="mb-2 grid h-14 w-14 place-items-center rounded-[20px] border border-stone-200 bg-white text-stone-400 dark:border-stone-800 dark:bg-stone-900"><Icon name="bookmarks" size={25} /></span>
        <strong className="text-base text-stone-800 dark:text-stone-100">{t('noBookmarks')}</strong>
        {!query && <span>{selectedList?.name}</span>}
      </div>}
    </section>

    {composerOpen && <section className="absolute bottom-[84px] left-6 right-6 z-20 flex flex-col gap-3 rounded-[24px] border border-stone-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
      <div className="flex min-w-0 items-center gap-3">
        <Favicon bookmark={current} />
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{current.title}</strong><small className="mt-0.5 block truncate text-xs text-stone-500">{current.url}</small></span>
        <button className="grid h-8 w-8 place-items-center rounded-full border-0 bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700" onClick={() => setComposerOpen(false)} aria-label={t('close')}><Icon name="close" size={17} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2"><select className="field rounded-xl py-2 text-sm" value={listId} onChange={(event) => void selectList(event.target.value)} aria-label={t('chooseList')}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><input className="field rounded-xl py-2 text-sm" value={tags} onChange={(event) => setTags(event.target.value)} placeholder={`${t('tags')} (a, b)`} /></div>
      <button className="h-10 rounded-full border-0 bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500" disabled={!tab.url || !listId || saving} onClick={() => void save()}>{saved ? `✓ ${t('saved')}` : saving ? '…' : t('savePage')}</button>
      {error && <p className="m-0 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>}

    <footer className="absolute bottom-4 left-6 right-6 z-10 flex h-16 items-center justify-between rounded-full border border-white/70 bg-white/75 px-3 py-2 shadow-xl backdrop-blur dark:border-white/10 dark:bg-stone-950/75">
      <button className="grid h-10 w-10 place-items-center rounded-full border-0 bg-white/80 text-stone-500 transition hover:bg-white active:scale-95 dark:bg-white/10 dark:text-stone-400 dark:hover:bg-white/15" onClick={() => { setSaved(false); setComposerOpen((open) => !open) }} aria-label={t('savePage')}><Icon name="plus" /></button>
      <button className="flex h-11 w-24 flex-col items-center justify-center border-0 bg-transparent text-stone-400" onClick={() => setSearchOpen((open) => !open)} aria-label={t('search')}><span className="h-1 w-12 rounded-full bg-stone-300 dark:bg-white/20" /><Icon name="up" size={22} /></button>
      <button className="grid h-10 w-10 place-items-center rounded-full border-0 bg-white/80 text-stone-500 transition hover:bg-white active:scale-95 dark:bg-white/10 dark:text-stone-400 dark:hover:bg-white/15" onClick={() => void openManager()} aria-label={t('edit')}><Icon name="edit" size={18} /></button>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Popup /></StrictMode>)
