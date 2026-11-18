import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'

export interface BookmarkActionHandlers {
  onEdit?: () => void
  onCopyUrl?: () => void
  onShare?: () => void
  onShareImage?: () => void
  onLoadPreview?: () => void
  onDelete?: () => void
}

export function getBookmarkActionMenuItems(
  { onEdit, onCopyUrl, onShare, onShareImage, onLoadPreview, onDelete }: BookmarkActionHandlers,
  t: (key: string) => string,
): NouMenuItem[] {
  return [
    { label: t('bookmarks.editAction'), icon: 'edit', handler: onEdit },
    { label: t('bookmarks.copyUrl'), icon: 'content-copy', handler: onCopyUrl },
    { label: t('bookmarks.share'), icon: 'share', handler: onShare },
    ...(onShareImage ? [{ label: t('bookmarks.shareImage'), icon: 'image' as const, handler: onShareImage }] : []),
    ...(onLoadPreview ? [{ label: t('preview.capturePreview'), icon: 'preview' as const, handler: onLoadPreview }] : []),
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

