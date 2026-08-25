import { useMemo, type ReactNode } from 'react'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { getInactiveLists, getVisibleLists } from 'nori/lib/nori-data'
import { useApp } from '../../../components/AppContext'
import { Icon } from '../../../components/Icon'
import { Menu } from '../../../components/Menu'
import { Sheet } from '../../../components/Overlays'
import { ManageRow, SectionLabel } from '../../../components/Rows'
import { Sortable, useSortableItem } from '../../../components/Sortable'
import { showSnackbar } from '../../../components/Snackbar'
import { isDeleted } from '../../../lib/domain'
import type { NoriList } from '../../../lib/model'

function SortableListRow({ list, dragLabel, actions }: { list: NoriList; dragLabel: string; actions: ReactNode }) {
  const { itemProps, handleProps, handleRef, isDragging } = useSortableItem(list.id)
  return (
    <div {...itemProps}>
      <ManageRow
        title={list.name}
        className={isDragging ? 'dragging' : ''}
        left={
          <button type="button" className="drag-handle" aria-label={dragLabel} ref={handleRef} {...handleProps}>
            <Icon name="drag" size={18} />
          </button>
        }
        actions={actions}
      />
    </div>
  )
}

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
  const ids = useMemo(() => visibleLists.map((list) => list.id), [visibleLists])
  const byId = useMemo(() => new Map(visibleLists.map((list) => [list.id, list])), [visibleLists])
  const reorder = (next: string[]) =>
    void mutate({ type: 'reorder-lists', ids: [...next, ...inactiveLists.map((list) => list.id)] })

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
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Sortable
          ids={ids}
          onReorder={reorder}
          strategy={verticalListSortingStrategy}
          modifiers={[restrictToVerticalAxis]}
        >
          {(order) => (
            <div className="grid gap-3 py-1">
              {order.map((id) => {
                const list = byId.get(id)
                return list ? (
                  <SortableListRow
                    key={id}
                    list={list}
                    dragLabel={t('reorderList', { name: list.name })}
                    actions={
                      <Menu
                        className="round-action"
                        label={t('moreOptions')}
                        items={listMenu(list, true)}
                        trigger={<Icon name="more" size={17} />}
                      />
                    }
                  />
                ) : null
              })}
            </div>
          )}
        </Sortable>
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
