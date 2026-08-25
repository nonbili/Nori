import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import {
  applyBookmarkBackup,
  exportBookmarksToHtml,
  exportBookmarksToJson,
  exportBookmarksToPlainText,
  mergeImportedBookmarks,
  parseBookmarksBackup,
  parseBookmarksForImport,
} from 'nori/lib/bookmark-transfer'
import { getAllTags, getTags } from 'nori/lib/nori-data'
import '../../lib/i18n'
import '../../styles.css'
import './manager.css'
import { Favicon } from '../../components/Favicon'
import { useSnapshot } from '../../components/useSnapshot'
import { request } from '../../lib/client'
import { languages } from '../../lib/i18n'
import { liveBookmarks, liveLists } from '../../lib/domain'
import type { BookmarkDraft, NoriBookmark } from '../../lib/model'

type View = 'bookmarks' | 'lists' | 'history' | 'settings' | 'about'
type Sort = 'newest' | 'oldest' | 'az'

const Button = ({ children, primary, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean }) => <button className={`button ${primary ? 'button-primary' : ''} ${danger ? 'text-rose-600 dark:text-rose-400' : ''}`} {...props}>{children}</button>

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BookmarkDialog({ bookmark, defaultListId, lists, onClose, onSaved }: { bookmark?: NoriBookmark; defaultListId: string; lists: ReturnType<typeof liveLists>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<BookmarkDraft>({ listId: bookmark?.listId || defaultListId, url: bookmark?.url || '', title: bookmark?.title || '', icon: bookmark?.icon || '', tags: bookmark ? getTags(bookmark) : [] })
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      if (bookmark) await request({ type: 'update-bookmark', id: bookmark.id, draft })
      else await request({ type: 'save-bookmark', draft })
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true"><form className="w-full max-w-lg overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-panel dark:border-stone-700 dark:bg-stone-900" onSubmit={(event) => void submit(event)}>
    <div className="space-y-4 p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{bookmark ? t('edit') : t('addBookmark')}</h2><button type="button" className="button button-ghost" onClick={onClose}>✕</button></div>
      <label className="block space-y-1.5"><span className="text-sm font-medium">{t('url')}</span><input className="field" required value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">{t('title')}</span><input className="field" value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">{t('list')}</span><select className="field" value={draft.listId} onChange={(event) => setDraft({ ...draft, listId: event.target.value })}>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">{t('tags')}</span><input className="field" value={(draft.tags || []).join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',') })} /></label>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div><div className="flex justify-end gap-2 border-t border-stone-200 p-4 dark:border-stone-800"><Button type="button" onClick={onClose}>{t('cancel')}</Button><Button primary type="submit">{t('save')}</Button></div>
  </form></div>
}

function App() {
  const { t, i18n } = useTranslation()
  const { snapshot, error, refresh, setError } = useSnapshot()
  const [view, setView] = useState<View>('bookmarks')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState('all')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('newest')
  const [editing, setEditing] = useState<NoriBookmark | 'new'>()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!snapshot) return
    void i18n.changeLanguage(snapshot.preferences.language)
    const dark = snapshot.preferences.theme === 'dark' || (snapshot.preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }, [snapshot, i18n])

  const lists = snapshot ? liveLists(snapshot.profile) : []
  const allBookmarks = snapshot ? liveBookmarks(snapshot.profile) : []
  const tags = useMemo(() => getAllTags(allBookmarks), [allBookmarks])
  const filtered = useMemo(() => allBookmarks.filter((bookmark) => {
    const haystack = `${bookmark.title} ${bookmark.url} ${getTags(bookmark).join(' ')}`.toLowerCase()
    return (!query || haystack.includes(query.toLowerCase())) && (listFilter === 'all' || bookmark.listId === listFilter) && tagFilters.every((tag) => getTags(bookmark).includes(tag))
  }).sort((a, b) => sort === 'az' ? a.title.localeCompare(b.title) : sort === 'oldest' ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt)), [allBookmarks, query, listFilter, tagFilters, sort])

  const mutate = async (message: Parameters<typeof request>[0]) => { try { await request(message); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } }
  const openBookmark = async (bookmark: NoriBookmark) => { await mutate({ type: 'open-bookmark', id: bookmark.id }); await browser.tabs.create({ url: bookmark.url }) }
  const deleteBookmark = (bookmark: NoriBookmark) => { if (confirm(`${t('delete')} “${bookmark.title}”?`)) void mutate({ type: 'delete-bookmark', id: bookmark.id }) }
  const addList = () => { const name = prompt(t('newList')); if (name) void mutate({ type: 'add-list', name }) }
  const renameList = (id: string, current: string) => { const name = prompt(t('rename'), current); if (name) void mutate({ type: 'rename-list', id, name }) }
  const deleteList = (id: string) => { if (confirm(t('confirmDeleteList'))) void mutate({ type: 'delete-list', id }) }
  const move = (ids: string[], id: string, delta: -1 | 1, type: 'lists' | 'bookmarks', listId?: string) => {
    const index = ids.indexOf(id); const target = index + delta; if (index < 0 || target < 0 || target >= ids.length) return
    const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]
    void mutate(type === 'lists' ? { type: 'reorder-lists', ids: next } : { type: 'reorder-bookmarks', listId: listId!, ids: next })
  }
  const exportData = (format: 'json' | 'html' | 'text') => {
    if (!snapshot) return
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'json') download(`nori-bookmarks-${stamp}.json`, exportBookmarksToJson(snapshot.profile.lists, snapshot.profile.bookmarks), 'application/json')
    if (format === 'html') download(`nori-bookmarks-${stamp}.html`, exportBookmarksToHtml(snapshot.profile.lists, snapshot.profile.bookmarks), 'text/html')
    if (format === 'text') download(`nori-bookmarks-${stamp}.txt`, exportBookmarksToPlainText(snapshot.profile.lists, snapshot.profile.bookmarks), 'text/plain')
  }
  const importData = async (file: File) => {
    if (!snapshot) return
    try {
      const text = await file.text(); let result
      if (file.name.toLowerCase().endsWith('.json')) {
        const backup = parseBookmarksBackup(text); if (!backup) throw new Error(t('invalidFile'))
        result = applyBookmarkBackup(snapshot.profile.lists, snapshot.profile.bookmarks, backup)
      } else {
        const parsed = parseBookmarksForImport(text, /\.html?$/i.test(file.name) ? 'html' : 'plain')
        result = mergeImportedBookmarks(snapshot.profile.lists, snapshot.profile.bookmarks, parsed)
      }
      await mutate({ type: 'replace-data', lists: result.lists, bookmarks: result.bookmarks })
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('invalidFile')) }
  }

  if (!snapshot) return <div className="grid min-h-screen place-items-center"><div className="text-stone-500">{error || 'Loading Nori…'}</div></div>
  const nav: [View, string, string][] = [['bookmarks', '⌘', t('bookmarks')], ['lists', '☷', t('lists')], ['history', '◷', t('history')], ['settings', '⚙', t('settings')], ['about', 'ⓘ', t('about')]]
  const syncLabel = snapshot.syncing ? t('syncing') : snapshot.auth.userId && snapshot.auth.plan !== 'free' ? t('synced') : t('localOnly')
  return <div className="min-h-screen lg:flex">
    <aside className="border-b border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900 lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r lg:p-5"><div className="flex items-center gap-3 px-2"><img className="h-10 w-10 rounded-2xl" src="/icon.png" alt="" /><div><div className="text-xl font-black">Nori</div><div className="text-xs text-stone-500">Bookmark Manager</div></div></div>
      <nav className="mt-5 flex gap-1 overflow-x-auto lg:flex-col">{nav.map(([id, icon, label]) => <button key={id} onClick={() => setView(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium transition ${view === id ? 'bg-nori-50 text-nori-700 dark:bg-nori-950 dark:text-nori-500' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'}`}><span className="w-5 text-center">{icon}</span>{label}</button>)}</nav>
      <div className="mt-6 hidden rounded-2xl bg-stone-100 p-3 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400 lg:block"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${snapshot.auth.userId && snapshot.auth.plan !== 'free' ? 'bg-nori-500' : 'bg-amber-500'}`} />{syncLabel}</div><div className="mt-1 truncate">{snapshot.auth.email || t('localProfile')}</div></div>
    </aside>
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8 lg:ml-64 lg:p-10">
      {view === 'bookmarks' && <section className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-black">{t('bookmarks')}</h1><p className="mt-1 text-stone-500 dark:text-stone-400">{allBookmarks.length} {t('bookmarks').toLowerCase()}</p></div><Button primary onClick={() => setEditing('new')}>＋ {t('addBookmark')}</Button></header>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]"><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} /><select className="field md:w-36" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="newest">{t('sortNewest')}</option><option value="oldest">{t('sortOldest')}</option><option value="az">{t('sortAZ')}</option></select></div>
        <div className="flex gap-2 overflow-x-auto pb-1"><button className={`chip ${listFilter === 'all' ? 'active' : ''}`} onClick={() => setListFilter('all')}>{t('all')}</button>{lists.map((list) => <button className={`chip ${listFilter === list.id ? 'active' : ''}`} key={list.id} onClick={() => setListFilter(list.id)}>{list.name}</button>)}</div>
        {tags.length > 0 && <div className="flex flex-wrap gap-2">{tags.map((tag) => <button key={tag} className={`chip ${tagFilters.includes(tag) ? 'active' : ''}`} onClick={() => setTagFilters(tagFilters.includes(tag) ? tagFilters.filter((item) => item !== tag) : [...tagFilters, tag])}>#{tag}</button>)}</div>}
        <div className="panel divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">{filtered.length ? filtered.map((bookmark) => { const sameList = filtered.filter((item) => item.listId === bookmark.listId); const ids = sameList.map((item) => item.id); return <article key={bookmark.id} className="flex items-center gap-3 p-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"><button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => void openBookmark(bookmark)}><Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{bookmark.title}</span><span className="block truncate text-xs text-stone-500">{bookmark.url}</span><span className="mt-1 block text-xs text-stone-400">{lists.find((item) => item.id === bookmark.listId)?.name}{getTags(bookmark).map((tag) => ` · #${tag}`)}</span></span></button><div className="hidden gap-1 sm:flex"><button className="icon-button" title={t('moveUp')} onClick={() => move(ids, bookmark.id, -1, 'bookmarks', bookmark.listId)}>↑</button><button className="icon-button" title={t('moveDown')} onClick={() => move(ids, bookmark.id, 1, 'bookmarks', bookmark.listId)}>↓</button><button className="icon-button" title={t('copy')} onClick={() => void navigator.clipboard.writeText(bookmark.url)}>⧉</button><button className="icon-button" title={t('edit')} onClick={() => setEditing(bookmark)}>✎</button><button className="icon-button text-rose-600" title={t('delete')} onClick={() => deleteBookmark(bookmark)}>⌫</button></div></article> }) : <div className="p-12 text-center text-stone-500">{t('noBookmarks')}</div>}</div>
      </section>}
      {view === 'lists' && <section className="space-y-5"><header className="flex items-center justify-between"><div><h1 className="text-3xl font-black">{t('lists')}</h1><p className="mt-1 text-stone-500">{lists.length} {t('lists').toLowerCase()}</p></div><Button primary onClick={addList}>＋ {t('newList')}</Button></header><div className="panel divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">{lists.map((list, index) => <div key={list.id} className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-nori-50 font-bold text-nori-700 dark:bg-nori-950 dark:text-nori-500">{list.name[0]?.toUpperCase()}</div><div className="min-w-0 flex-1"><div className="font-semibold">{list.name}</div><div className="text-xs text-stone-500">{allBookmarks.filter((item) => item.listId === list.id).length} {t('bookmarks').toLowerCase()}</div></div><button className="icon-button" onClick={() => move(lists.map((item) => item.id), list.id, -1, 'lists')} disabled={index === 0}>↑</button><button className="icon-button" onClick={() => move(lists.map((item) => item.id), list.id, 1, 'lists')} disabled={index === lists.length - 1}>↓</button><Button onClick={() => renameList(list.id, list.name)}>{t('rename')}</Button><Button danger onClick={() => deleteList(list.id)}>{t('delete')}</Button></div>)}</div></section>}
      {view === 'history' && <section className="space-y-5"><h1 className="text-3xl font-black">{t('history')}</h1><div className="panel divide-y divide-stone-200 overflow-hidden dark:divide-stone-800">{snapshot.profile.history.length ? snapshot.profile.history.map((item) => <button key={item.id} className="flex w-full items-center gap-3 p-4 text-left hover:bg-stone-50 dark:hover:bg-stone-800" onClick={() => void browser.tabs.create({ url: item.url })}><Favicon bookmark={item} enabled={snapshot.preferences.showFavicons} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="block truncate text-xs text-stone-500">{new Date(item.openedAt).toLocaleString()}</span></span><span>↗</span></button>) : <div className="p-12 text-center text-stone-500">{t('noBookmarks')}</div>}</div></section>}
      {view === 'settings' && <section className="space-y-6"><h1 className="text-3xl font-black">{t('settings')}</h1><SettingsCard title={t('account')}><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="font-semibold">{snapshot.auth.email || t('noAccount')}</div><div className="text-sm text-stone-500">{snapshot.auth.userId ? `${t('plan')}: ${snapshot.auth.plan}` : t('offlineEdits')}</div>{snapshot.profile.lastSyncAt && <div className="mt-1 text-xs text-stone-400">{t('lastSync')}: {new Date(snapshot.profile.lastSyncAt).toLocaleString()}</div>}</div><div className="flex flex-wrap gap-2">{snapshot.auth.userId ? <><Button onClick={() => void mutate({ type: 'sync' })} disabled={snapshot.syncing || snapshot.auth.plan === 'free'}>{t('sync')}</Button><Button onClick={() => void browser.tabs.create({ url: 'https://nori.inks.page/app' })}>{t('managePlan')} ↗</Button><Button onClick={() => void mutate({ type: 'sign-out' })}>{t('signOut')}</Button></> : <Button primary onClick={() => void mutate({ type: 'sign-in' })}>{t('signIn')}</Button>}</div></div></SettingsCard>
        <SettingsCard title={t('settings')}><div className="settings-grid"><label>{t('theme')}<select className="field" value={snapshot.preferences.theme} onChange={(event) => void mutate({ type: 'set-preferences', preferences: { theme: event.target.value as any } })}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label><label>{t('language')}<select className="field" value={snapshot.preferences.language} onChange={(event) => void mutate({ type: 'set-preferences', preferences: { language: event.target.value } })}>{languages.map((language) => <option key={language}>{language}</option>)}</select></label><label>{t('searchProvider')}<select className="field" value={snapshot.preferences.searchProvider} onChange={(event) => void mutate({ type: 'set-preferences', preferences: { searchProvider: event.target.value as any } })}><option value="google">{t('google')}</option><option value="duckduckgo">{t('duckduckgo')}</option></select></label><label className="flex-row"><input type="checkbox" checked={snapshot.preferences.showFavicons} onChange={(event) => void mutate({ type: 'set-preferences', preferences: { showFavicons: event.target.checked } })} /> {t('showFavicons')}</label></div></SettingsCard>
        <SettingsCard title={`${t('import')} / ${t('export')}`}><input ref={fileRef} className="hidden" type="file" accept=".json,.html,.htm,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = '' }} /><div className="flex flex-wrap gap-2"><Button onClick={() => fileRef.current?.click()}>{t('import')}</Button><Button onClick={() => exportData('json')}>{t('backup')}</Button><Button onClick={() => exportData('html')}>{t('html')}</Button><Button onClick={() => exportData('text')}>{t('text')}</Button></div></SettingsCard>
      </section>}
      {view === 'about' && <section className="space-y-6"><h1 className="text-3xl font-black">{t('about')}</h1><div className="panel p-6"><div className="flex items-center gap-4"><img className="h-16 w-16 rounded-3xl" src="/icon.png" alt="" /><div><div className="text-2xl font-black">Nori</div><div className="text-stone-500">{t('version')}</div></div></div><p className="mt-6 max-w-2xl text-stone-600 dark:text-stone-300">{t('privacy')}</p><div className="mt-5 flex gap-2"><Button onClick={() => void browser.tabs.create({ url: 'https://github.com/nonbili/Nori/releases' })}>{t('changelog')} ↗</Button><Button onClick={() => void browser.tabs.create({ url: 'https://github.com/nonbili/Nori' })}>GitHub ↗</Button></div></div></section>}
      {(error || snapshot.syncError) && <div className="fixed bottom-5 right-5 max-w-sm rounded-2xl bg-rose-600 px-4 py-3 text-sm text-white shadow-panel"><button className="float-right ml-3" onClick={() => setError('')}>✕</button>{error || snapshot.syncError}</div>}
    </main>
    {editing && <BookmarkDialog bookmark={editing === 'new' ? undefined : editing} defaultListId={snapshot.preferences.lastListId || lists[0]?.id || ''} lists={lists} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void refresh() }} />}
  </div>
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel overflow-hidden"><h2 className="border-b border-stone-200 px-5 py-4 text-lg font-bold dark:border-stone-800">{title}</h2><div className="p-5">{children}</div></section> }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
