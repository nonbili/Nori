import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { useEscape } from './useEscape'

// The Android bottom sheet: backdrop, rounded top, grabber, header row.
export function Sheet({
  title,
  onClose,
  children,
  headerLeft,
  headerRight,
  showHeader = true,
  showCloseButton = true,
  height = '85%',
}: {
  title?: string
  onClose: () => void
  children: ReactNode
  headerLeft?: ReactNode
  headerRight?: ReactNode
  showHeader?: boolean
  showCloseButton?: boolean
  height?: string
}) {
  const { t } = useTranslation()
  useEscape(onClose)
  return (
    <div className="overlay-root">
      <div className="overlay-backdrop" onClick={onClose} />
      <section className="sheet" style={{ height }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grabber">
          <span />
        </div>
        {showHeader && (
          <header className="sheet-header">
            <div className="flex min-w-0 items-center gap-3">
              {headerLeft}
              {title ? <h2 className="m-0 truncate text-xl font-semibold">{title}</h2> : null}
            </div>
            <div className="flex items-center gap-2">
              {headerRight}
              {showCloseButton && (
                <button className="round-action" onClick={onClose} aria-label={t('close')}>
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          </header>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </section>
    </div>
  )
}

// The Android centred modal, used for the bookmark and list editors.
export function CenterModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay-root">
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="center-modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

// The Android all-bookmarks drawer covers the whole screen from the bottom.
export function FullCover({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="full-cover" role="dialog" aria-modal="true">
      {children}
    </div>
  )
}
