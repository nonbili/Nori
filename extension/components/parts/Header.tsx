import { useTranslation } from 'react-i18next'
import { Icon } from '../Icon'
import { Menu } from '../Menu'

export function Header({
  hasList,
  editMode,
  onOpenDrawer,
  onOpenHistory,
  onOpenLists,
  onOpenSettings,
  onToggleEdit,
  onOpenInTab,
}: {
  hasList: boolean
  editMode: boolean
  onOpenDrawer: () => void
  onOpenHistory: () => void
  onOpenLists: () => void
  onOpenSettings: () => void
  onToggleEdit: () => void
  onOpenInTab?: () => void
}) {
  const { t } = useTranslation()
  return (
    <header className="flex items-center justify-between px-6 pb-2 pt-5">
      <button className="header-action" onClick={onOpenDrawer} aria-label={t('openDrawer')}>
        <Icon name="bookmarks" />
      </button>
      <div className="flex items-center gap-4">
        <button className="header-action" onClick={onOpenHistory} aria-label={t('history')}>
          <Icon name="history" />
        </button>
        <Menu
          className="header-action"
          label={t('moreOptions')}
          trigger={<Icon name="more" />}
          items={[
            { label: t('manageLists'), icon: 'list', handler: onOpenLists },
            ...(hasList
              ? [
                  {
                    label: editMode ? t('doneEditing') : t('editMultiple'),
                    icon: editMode ? ('check' as const) : ('edit' as const),
                    handler: onToggleEdit,
                  },
                ]
              : []),
            ...(onOpenInTab ? [{ label: t('openInTab'), icon: 'external' as const, handler: onOpenInTab }] : []),
            { label: t('settings'), icon: 'settings', handler: onOpenSettings },
          ]}
        />
      </div>
    </header>
  )
}
