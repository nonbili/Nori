import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { useEscape } from './useEscape'

export interface MenuItem {
  id?: string
  label: string
  icon?: IconName
  selected?: boolean
  danger?: boolean
  handler?: () => void
}

interface Anchor {
  top: number
  bottom: number
  right: number
}

const MENU_WIDTH = 200
const EDGE = 8

// The Android app anchors its menus to the pressed element; the popup is small,
// so the position is clamped into the viewport the same way.
function MenuPanel({
  anchor,
  items,
  empty,
  onClose,
  isAnchor,
}: {
  anchor: Anchor
  items: MenuItem[]
  empty?: string
  onClose: () => void
  isAnchor?: (target: Node) => boolean
}) {
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })
  const menuRef = useRef<HTMLDivElement>(null)
  useEscape(onClose)

  // Any press outside the panel dismisses it; presses on the trigger are left
  // to the trigger itself so it can toggle.
  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !isAnchor?.(target)) onClose()
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [isAnchor, onClose])

  useLayoutEffect(() => {
    const height = menuRef.current?.offsetHeight || items.length * 40 + 8
    const below = anchor.bottom + 4
    const top = below + height + EDGE <= window.innerHeight ? below : Math.max(anchor.top - height - 4, EDGE)
    const left = Math.min(Math.max(anchor.right - MENU_WIDTH, EDGE), window.innerWidth - MENU_WIDTH - EDGE)
    setPosition({ top, left })
  }, [anchor, items.length])

  return (
    <div ref={menuRef} className="anchor-menu" role="menu" style={{ top: position.top, left: position.left }}>
      {items.length ? (
        items.map((item, index) => (
          <button
            key={item.id || `${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            onClick={() => {
              onClose()
              item.handler?.()
            }}
          >
            {item.icon ? <Icon name={item.icon} size={17} /> : null}
            <span>{item.label}</span>
            {item.selected ? <Icon name="check" size={15} /> : null}
          </button>
        ))
      ) : (
        <span className="menu-empty">{empty}</span>
      )}
    </div>
  )
}

export function Menu({
  items,
  trigger,
  label,
  className,
  empty,
}: {
  items: MenuItem[]
  trigger: ReactNode
  label?: string
  className?: string
  empty?: string
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setAnchor(null), [])
  const isAnchor = useCallback((target: Node) => !!anchorRef.current?.contains(target), [])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (anchor) return close()
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({ top: rect.top, bottom: rect.bottom, right: rect.right })
        }}
      >
        {trigger}
      </button>
      {anchor && <MenuPanel anchor={anchor} items={items} empty={empty} onClose={close} isAnchor={isAnchor} />}
    </>
  )
}

// Right-clicking anywhere on the wrapped element opens the same menu at the
// cursor, the desktop stand-in for Android's long press.
export function ContextMenu({
  items,
  children,
  className,
  empty,
}: {
  items: MenuItem[]
  children: ReactNode
  className?: string
  empty?: string
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const close = useCallback(() => setAnchor(null), [])

  return (
    <>
      <div
        className={className}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setAnchor({ top: event.clientY, bottom: event.clientY, right: event.clientX + MENU_WIDTH })
        }}
      >
        {children}
      </div>
      {anchor && <MenuPanel anchor={anchor} items={items} empty={empty} onClose={close} />}
    </>
  )
}
