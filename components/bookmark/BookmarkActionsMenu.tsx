import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'

export interface BookmarkActionHandlers {
  onEdit?: () => void
  onCopyUrl?: () => void
  onShare?: () => void
  onDelete?: () => void
}

export function getBookmarkActionMenuItems(
  { onEdit, onCopyUrl, onShare, onDelete }: BookmarkActionHandlers,
  t: (key: string) => string,
): NouMenuItem[] {
  return [
    { label: t('bookmarks.editAction'), icon: 'edit', handler: onEdit },
    { label: t('bookmarks.copyUrl'), icon: 'content-copy', handler: onCopyUrl },
    { label: t('bookmarks.share'), icon: 'share', handler: onShare },
    { label: t('bookmarks.delete'), icon: 'delete', handler: onDelete },
  ]
}

export function BookmarkActionsMenu({
  trigger,
  ...handlers
}: {
  trigger: ReactNode
} & BookmarkActionHandlers) {
  const { t } = useTranslation()
  return (
    <NouMenu
      items={getBookmarkActionMenuItems(handlers, t)}
      trigger={trigger}
    />
  )
}

