import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../../../components/AppContext'
import { Favicon } from '../../../components/Favicon'
import { Icon } from '../../../components/Icon'
import { Menu, type MenuItem } from '../../../components/Menu'
import { SectionLabel } from '../../../components/Rows'
import { isDeleted, isVisible } from '../../../lib/domain'
import type { NoriBookmark, NoriList } from '../../../lib/model'

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

function BookmarkTile({
  bookmark,
  editMode,
  selected,
  handlers,
  onSelect,
  dragProps,
  dragging,
}: {
  bookmark: NoriBookmark
  editMode: boolean
  selected: boolean
  handlers: BookmarkHandlers
  onSelect: () => void
  dragProps?: Partial<React.HTMLAttributes<HTMLDivElement>> & { draggable?: boolean }
  dragging?: boolean
}) {
  const { t } = useTranslation()
  const { snapshot } = useApp()
  const items = useBookmarkMenuItems(bookmark, handlers)
  return (
    <div className={`bookmark-wrap ${dragging ? 'dragging' : ''}`} {...dragProps}>
      <button
        type="button"
        className={`bookmark-pill ${selected ? 'selected' : ''}`}
        title={bookmark.url}
        onClick={() => (editMode ? onSelect() : handlers.onOpen(bookmark))}
      >
        <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} />
        <span>{bookmark.title}</span>
        {selected && (
          <span className="selection-check">
            <Icon name="check" size={12} />
          </span>
        )}
      </button>
      {!editMode && (
        <Menu
          className="tile-menu-button"
          label={t('bookmarkActions')}
          items={items}
          trigger={<Icon name="more" size={15} />}
        />
      )}
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
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string>()
  const orderRef = useRef<string[]>([])
  const overscrollRef = useRef(0)

  useEffect(() => {
    const ids = listBookmarks.map((item) => item.id)
    setOrderedIds(ids)
    orderRef.current = ids
  }, [listBookmarks])

  const shown = useMemo(() => {
    if (!editMode) return listBookmarks
    const byId = new Map(listBookmarks.map((item) => [item.id, item]))
    return orderedIds.map((id) => byId.get(id)).filter(Boolean) as NoriBookmark[]
  }, [editMode, listBookmarks, orderedIds])

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
    if (listId) void mutate({ type: 'reorder-bookmarks', listId, ids: orderRef.current })
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
      {shown.length ? (
        <div className="bookmark-grid">
          {shown.map((bookmark) => (
            <BookmarkTile
              key={bookmark.id}
              bookmark={bookmark}
              editMode={editMode}
              selected={selectedIds.includes(bookmark.id)}
              handlers={handlers}
              onSelect={() => onToggleSelected(bookmark.id)}
              dragging={draggingId === bookmark.id}
              dragProps={
                editMode
                  ? {
                      draggable: true,
                      onDragStart: (event: DragEvent<HTMLDivElement>) => {
                        setDraggingId(bookmark.id)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', bookmark.id)
                      },
                      onDragOver: (event: DragEvent<HTMLDivElement>) => reorderOver(event, bookmark.id),
                      onDrop: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
                      onDragEnd: finishDrag,
                    }
                  : undefined
              }
            />
          ))}
        </div>
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
