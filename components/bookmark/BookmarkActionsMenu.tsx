import { type ReactNode } from 'react'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'

export interface BookmarkActionHandlers {
  onEdit?: () => void
  onCopyUrl?: () => void
  onShare?: () => void
  onDelete?: () => void
}

export function getBookmarkActionMenuItems({
  onEdit,
  onCopyUrl,
  onShare,
  onDelete,
}: BookmarkActionHandlers): NouMenuItem[] {
  return [
    { label: 'Edit', icon: 'edit', handler: onEdit },
    { label: 'Copy URL', icon: 'content-copy', handler: onCopyUrl },
    { label: 'Share', icon: 'share', handler: onShare },
    { label: 'Delete', icon: 'delete', handler: onDelete },
  ]
}

export function BookmarkActionsMenu({
  trigger,
  ...handlers
}: {
  trigger: ReactNode
} & BookmarkActionHandlers) {
  return (
    <NouMenu
      items={getBookmarkActionMenuItems(handlers)}
      trigger={trigger}
    />
  )
}
