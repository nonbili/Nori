import { useMemo, useRef } from 'react'
import { rectSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useApp } from '../AppContext'
import { Favicon } from '../Favicon'
import { Icon } from '../Icon'
import { ContextMenu, type MenuItem } from '../Menu'
import { SectionLabel } from '../Rows'
import { Sortable, useSortableItem } from '../Sortable'
import { isDeleted, isVisible } from '../../lib/domain'
import type { NoriBookmark, NoriList } from '../../lib/model'

export interface BookmarkHandlers {
  onOpen: (bookmark: NoriBookmark) => void
  onEdit: (bookmark: NoriBookmark) => void
  onCopyUrl: (bookmark: NoriBookmark) => void
  onShare: (bookmark: NoriBookmark) => void
  onDelete: (bookmark: NoriBookmark) => void
}

export function useBookmarkMenuItems(bookmark: NoriBookmark, handlers: BookmarkHandlers): MenuItem[] {
  const { t } = useTranslation()
  return [
    { label: t('edit'), icon: 'edit', handler: () => handlers.onEdit(bookmark) },
    { label: t('copy'), icon: 'copy', handler: () => handlers.onCopyUrl(bookmark) },
    { label: t('share'), icon: 'share', handler: () => handlers.onShare(bookmark) },
    { label: t('delete'), icon: 'delete', danger: true, handler: () => handlers.onDelete(bookmark) },
  ]
}

function BookmarkPill({
  bookmark,
  selected,
  onClick,
}: {
  bookmark: NoriBookmark
  selected?: boolean
  onClick?: () => void
}) {
  const { snapshot } = useApp()
  return (
    <button
      type="button"
      className={`bookmark-pill ${selected ? 'selected' : ''}`}
      title={bookmark.title}
      onClick={onClick}
    >
      <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} />
      <span>{bookmark.title}</span>
      {selected && (
        <span className="selection-check">
          <Icon name="check" size={12} />
        </span>
      )}
    </button>
  )
}

function BookmarkTile({
  bookmark,
  editMode,
  selected,
  handlers,
  onSelect,
}: {
  bookmark: NoriBookmark
  editMode: boolean
  selected: boolean
  handlers: BookmarkHandlers
  onSelect: () => void
}) {
  const items = useBookmarkMenuItems(bookmark, handlers)
  const { itemProps, handleProps, isDragging } = useSortableItem(bookmark.id)
  const pill = (
    <BookmarkPill
      bookmark={bookmark}
      selected={selected}
      onClick={() => (editMode ? onSelect() : handlers.onOpen(bookmark))}
    />
  )
  return (
    <div className={`bookmark-wrap draggable ${isDragging ? 'dragging' : ''}`} {...itemProps} {...handleProps}>
      {editMode ? pill : <ContextMenu items={items}>{pill}</ContextMenu>}
    </div>
  )
}

function EmptyList({ listName }: { listName: string }) {
  const { t } = useTranslation()
  return (
    <div className="empty-state">
      <span className="empty-badge">
        <Icon name="bookmarkBorder" size={24} />
      </span>
      <strong>{t('emptyListTitle', { name: listName })}</strong>
      <small>{t('emptyListHint')}</small>
      <div className="empty-tip">
        <span>{t('tip')}</span>
        <p>{t('saveTip')}</p>
      </div>
    </div>
  )
}

export function BookmarkGrid({
  list,
  editMode,
  selectedIds,
  onToggleSelected,
  handlers,
  onOverscroll,
}: {
  list?: NoriList
  editMode: boolean
  selectedIds: string[]
  onToggleSelected: (id: string) => void
  handlers: BookmarkHandlers
  onOverscroll?: () => void
}) {
  const { t } = useTranslation()
  const { snapshot, bookmarks, mutate } = useApp()
  const listId = list?.id
  const listBookmarks = useMemo(() => bookmarks.filter((bookmark) => bookmark.listId === listId), [bookmarks, listId])
  const hiddenBookmarks = useMemo(
    () =>
      snapshot.profile.bookmarks
        .filter((item) => item.listId === listId && !isDeleted(item) && !isVisible(item))
        .sort((a, b) => Number(a.json.sort_index || 0) - Number(b.json.sort_index || 0)),
    [listId, snapshot],
  )
  const overscrollRef = useRef(0)

  const ids = useMemo(() => listBookmarks.map((item) => item.id), [listBookmarks])
  const byId = useMemo(() => new Map(listBookmarks.map((item) => [item.id, item])), [listBookmarks])
  const reorder = (next: string[]) => {
    if (listId) void mutate({ type: 'reorder-bookmarks', listId, ids: next })
  }

  // Android opens the drawer when the grid is pulled past its bottom edge; a
  // wheel overscroll is the desktop equivalent.
  const onWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (editMode || !onOverscroll || event.deltaY <= 0) return
    const element = event.currentTarget
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 2
    if (!atBottom) {
      overscrollRef.current = 0
      return
    }
    overscrollRef.current += event.deltaY
    if (overscrollRef.current > 120) {
      overscrollRef.current = 0
      onOverscroll()
    }
  }

  return (
    <section className="bookmark-page" onWheel={onWheel}>
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
      {ids.length ? (
        <Sortable ids={ids} onReorder={reorder} strategy={rectSortingStrategy}>
          {(order) => (
            <div className="bookmark-grid">
              {order.map((id) => {
                const bookmark = byId.get(id)
                return bookmark ? (
                  <BookmarkTile
                    key={id}
                    bookmark={bookmark}
                    editMode={editMode}
                    selected={selectedIds.includes(id)}
                    handlers={handlers}
                    onSelect={() => onToggleSelected(id)}
                  />
                ) : null
              })}
            </div>
          )}
        </Sortable>
      ) : (
        !editMode && list && <EmptyList listName={list.name} />
      )}
      {editMode && hiddenBookmarks.length > 0 && (
        <div className="mt-7">
          <SectionLabel title={t('hiddenInList')} subtitle={t('hiddenHint')} />
          <div className="bookmark-grid">
            {hiddenBookmarks.map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                className="bookmark-pill opacity-60"
                title={bookmark.title}
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
  )
}
