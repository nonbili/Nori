import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import type { NoriList } from '../../lib/model'

export function Toolbar({
  editMode,
  selectedCount,
  allSelected,
  hasBookmarks,
  moveTargets,
  onNew,
  onOpenDrawer,
  onToggleEdit,
  onSelectAll,
  onHide,
  onMove,
  onShare,
  onDelete,
}: {
  editMode: boolean
  selectedCount: number
  allSelected: boolean
  hasBookmarks: boolean
  moveTargets: NoriList[]
  onNew: () => void
  onOpenDrawer: () => void
  onToggleEdit: () => void
  onSelectAll: () => void
  onHide: () => void
  onMove: (listId: string) => void
  onShare: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  if (editMode && selectedCount > 0)
    return (
      <footer className="floating-toolbar">
        <button
          className="selection-count"
          onClick={onSelectAll}
          aria-label={allSelected ? t('deselectAll') : t('selectAll')}
        >
          <Icon name={allSelected ? 'checkbox' : 'checkboxEmpty'} size={19} />
          {selectedCount}
        </button>
        <Menu
          className="toolbar-action"
          label={t('moveTo')}
          empty={t('noOtherLists')}
          trigger={<Icon name="move" />}
          items={moveTargets.map((list) => ({ id: list.id, label: list.name, handler: () => onMove(list.id) }))}
        />
        <button className="toolbar-action" onClick={onHide} aria-label={t('hide')}>
          <Icon name="hide" />
        </button>
        <button className="toolbar-action" onClick={onShare} aria-label={t('share')}>
          <Icon name="share" />
        </button>
        <button className="toolbar-action danger" onClick={onDelete} aria-label={t('delete')}>
          <Icon name="delete" />
        </button>
        <button className="toolbar-action done" onClick={onToggleEdit} aria-label={t('doneEditing')}>
          <Icon name="check" />
        </button>
      </footer>
    )

  return (
    <footer className="floating-toolbar">
      {editMode ? (
        <button className="select-all" onClick={onSelectAll} disabled={!hasBookmarks}>
          {t('selectAll')}
        </button>
      ) : (
        <button className="toolbar-action" onClick={onNew} aria-label={t('savePage')}>
          <Icon name="add" />
        </button>
      )}
      {editMode ? (
        <span className="flex-1" />
      ) : (
        <button className="search-handle" onClick={onOpenDrawer} aria-label={t('openDrawer')}>
          <span />
          <Icon name="up" size={22} />
        </button>
      )}
      <button
        className={`toolbar-action ${editMode ? 'done' : ''}`}
        onClick={onToggleEdit}
        aria-label={editMode ? t('doneEditing') : t('editMultiple')}
      >
        <Icon name={editMode ? 'check' : 'edit'} size={editMode ? 20 : 18} />
      </button>
    </footer>
  )
}
