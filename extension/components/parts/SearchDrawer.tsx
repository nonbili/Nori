import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAllTags } from 'nori/lib/nori-data'
import { useApp } from '../AppContext'
import { Favicon } from '../Favicon'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { FullCover } from '../Overlays'
import { ManageRow } from '../Rows'
import { createdAtMs, hostLabel } from '../../lib/format'
import { tagsOf } from '../../lib/domain'
import { useBookmarkMenuItems, type BookmarkHandlers } from './BookmarkGrid'
import type { NoriBookmark } from '../../lib/model'

type SortType = 'newest' | 'oldest' | 'az' | 'za'

function ResultRow({ bookmark, handlers }: { bookmark: NoriBookmark; handlers: BookmarkHandlers }) {
  const { t } = useTranslation()
  const { snapshot } = useApp()
  const items = useBookmarkMenuItems(bookmark, handlers)
  return (
    <ManageRow
      title={bookmark.title}
      subtitle={hostLabel(bookmark.url)}
      onClick={() => handlers.onOpen(bookmark)}
      left={<Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} variant="row" />}
      actions={
        <Menu
          className="round-action"
          label={t('bookmarkActions')}
          items={items}
          trigger={<Icon name="more" size={17} />}
        />
      }
    />
  )
}

export function SearchDrawer({
  filterListId,
  setFilterListId,
  onClose,
  handlers,
}: {
  filterListId: string
  setFilterListId: (value: string) => void
  onClose: () => void
  handlers: BookmarkHandlers
}) {
  const { t } = useTranslation()
  const { lists, bookmarks } = useApp()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortType>('newest')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true })
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  const scopedBookmarks = useMemo(
    () => (filterListId === 'all' ? bookmarks : bookmarks.filter((item) => item.listId === filterListId)),
    [bookmarks, filterListId],
  )
  // Only tags inside the current list scope; a tag absent from it would (AND logic)
  // always produce an empty result.
  const tags = useMemo(() => getAllTags(scopedBookmarks), [scopedBookmarks])

  useEffect(() => {
    const available = new Set(tags.map((tag) => tag.toLowerCase()))
    setFilterTags((current) => {
      const next = current.filter((tag) => available.has(tag.toLowerCase()))
      return next.length === current.length ? current : next
    })
  }, [tags])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const wanted = filterTags.map((tag) => tag.toLowerCase())
    const matched = scopedBookmarks.filter((bookmark) => {
      const bookmarkTags = tagsOf(bookmark).map((tag) => tag.toLowerCase())
      if (wanted.length && !wanted.every((tag) => bookmarkTags.includes(tag))) return false
      if (!needle) return true
      return bookmark.title.toLowerCase().includes(needle) || bookmark.url.toLowerCase().includes(needle)
    })
    return matched.sort((a, b) => {
      switch (sort) {
        case 'az':
          return a.title.localeCompare(b.title)
        case 'za':
          return b.title.localeCompare(a.title)
        case 'oldest':
          return createdAtMs(a.createdAt) - createdAtMs(b.createdAt)
        default:
          return createdAtMs(b.createdAt) - createdAtMs(a.createdAt)
      }
    })
  }, [filterTags, query, scopedBookmarks, sort])

  const sortLabel = { newest: t('sortNewest'), oldest: t('sortOldest'), az: t('sortAZ'), za: t('sortZA') }[sort]

  return (
    <FullCover onClose={onClose}>
      <div className="flex items-center gap-3 px-6 pt-5">
        <button className="header-action" onClick={onClose} aria-label={t('back')}>
          <Icon name="back" size={18} />
        </button>
        <div className="drawer-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <Menu
          className="sort-trigger"
          label={t('sortNewest')}
          trigger={
            <>
              <Icon name="sort" size={17} />
              <span>{sortLabel}</span>
              <Icon name="down" size={15} />
            </>
          }
          items={[
            { label: t('sortNewestFirst'), selected: sort === 'newest', handler: () => setSort('newest') },
            { label: t('sortOldestFirst'), selected: sort === 'oldest', handler: () => setSort('oldest') },
            { label: t('sortNameAZ'), selected: sort === 'az', handler: () => setSort('az') },
            { label: t('sortNameZA'), selected: sort === 'za', handler: () => setSort('za') },
          ]}
        />
      </div>
      <nav className="list-chips flex shrink-0 gap-2 overflow-x-auto px-6 pt-4">
        <button
          className={`list-chip ${filterListId === 'all' ? 'active' : ''}`}
          onClick={() => setFilterListId('all')}
        >
          {t('all')}
        </button>
        {lists.map((list) => (
          <button
            key={list.id}
            className={`list-chip ${filterListId === list.id ? 'active' : ''}`}
            onClick={() => setFilterListId(list.id)}
          >
            {list.name}
          </button>
        ))}
      </nav>
      {tags.length > 0 && (
        <div className="list-chips flex shrink-0 gap-2 overflow-x-auto px-6 pt-3">
          {tags.map((tag) => {
            const active = filterTags.includes(tag)
            return (
              <button
                key={tag}
                className={`tag-chip ${active ? 'active' : ''}`}
                onClick={() => setFilterTags(active ? filterTags.filter((item) => item !== tag) : [...filterTags, tag])}
              >
                <span>#</span>
                {tag}
              </button>
            )
          })}
        </div>
      )}
      <div className="drawer-results">
        {results.length ? (
          <div className="grid min-w-0 gap-3">
            {results.map((bookmark) => (
              <ResultRow key={bookmark.id} bookmark={bookmark} handlers={handlers} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-badge">
              <Icon name="searchOff" size={24} />
            </span>
            <strong>{t('noSearchResults')}</strong>
            <small>{t('noSearchResultsHint')}</small>
          </div>
        )}
      </div>
    </FullCover>
  )
}
