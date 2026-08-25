import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getInactiveLists, getVisibleLists } from 'nori/lib/nori-data'
import { useApp } from '../../../components/AppContext'
import { Icon } from '../../../components/Icon'
import { Menu } from '../../../components/Menu'
import { Sheet } from '../../../components/Overlays'
import { ManageRow, SectionLabel } from '../../../components/Rows'
import { showSnackbar } from '../../../components/Snackbar'
import { isDeleted } from '../../../lib/domain'
import type { NoriList } from '../../../lib/model'

export function ListsSheet({
  onClose,
  onNewList,
  onRenameList,
}: {
  onClose: () => void
  onNewList: () => void
  onRenameList: (list: NoriList) => void
}) {
  const { t } = useTranslation()
  const { snapshot, mutate } = useApp()
  const visibleLists = getVisibleLists(snapshot.profile.lists)
  const inactiveLists = getInactiveLists(snapshot.profile.lists)
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string>()
  const orderRef = useRef<string[]>([])

  useEffect(() => {
    const ids = visibleLists.map((list) => list.id)
    setOrderedIds(ids)
    orderRef.current = ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLists.map((list) => list.id).join(',')])

  const ordered = orderedIds.map((id) => visibleLists.find((list) => list.id === id)).filter(Boolean) as NoriList[]

  const dragOver = (event: DragEvent, targetId: string) => {
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
    void mutate({ type: 'reorder-lists', ids: [...orderRef.current, ...inactiveLists.map((list) => list.id)] })
  }

  const deleteList = async (list: NoriList) => {
    const affected = snapshot.profile.bookmarks.filter((item) => item.listId === list.id && !isDeleted(item))
    await mutate({ type: 'delete-list', id: list.id })
    showSnackbar(t('listDeleted'), t('undo'), () => void mutate({ type: 'restore-list', list, bookmarks: affected }))
  }

  const listMenu = (list: NoriList, visible: boolean) => [
    { label: t('renameList'), icon: 'edit' as const, handler: () => onRenameList(list) },
    visible
      ? {
          label: t('hide'),
          icon: 'hide' as const,
          handler: () => void mutate({ type: 'set-list-visibility', id: list.id, visible: false }),
        }
      : {
          label: t('show'),
          icon: 'show' as const,
          handler: () => void mutate({ type: 'set-list-visibility', id: list.id, visible: true }),
        },
    { label: t('delete'), icon: 'delete' as const, danger: true, handler: () => void deleteList(list) },
  ]

  return (
    <Sheet
      title={t('manageLists')}
      onClose={onClose}
      headerRight={
        <button className="pill-button" onClick={onNewList}>
          <Icon name="add" size={15} />
          {t('newList')}
        </button>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="grid gap-3">
          {ordered.map((list) => (
            <div
              key={list.id}
              onDragOver={(event) => dragOver(event, list.id)}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={finishDrag}
              draggable={draggingId === list.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', list.id)
              }}
            >
              <ManageRow
                title={list.name}
                className={draggingId === list.id ? 'opacity-50' : ''}
                left={
                  <span
                    className="drag-handle"
                    aria-hidden="true"
                    onMouseDown={() => setDraggingId(list.id)}
                    onMouseUp={() => setDraggingId(undefined)}
                  >
                    <Icon name="drag" size={18} />
                  </span>
                }
                actions={
                  <Menu
                    className="round-action"
                    label={t('moreOptions')}
                    items={listMenu(list, true)}
                    trigger={<Icon name="more" size={17} />}
                  />
                }
              />
            </div>
          ))}
        </div>
        {inactiveLists.length > 0 && (
          <div className="mt-8">
            <SectionLabel title={t('hiddenLists')} />
            <div className="grid gap-3">
              {inactiveLists.map((list) => (
                <ManageRow
                  key={list.id}
                  title={list.name}
                  actions={
                    <Menu
                      className="round-action"
                      label={t('moreOptions')}
                      items={listMenu(list, false)}
                      trigger={<Icon name="more" size={17} />}
                    />
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
