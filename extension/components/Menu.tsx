import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

const MENU_WIDTH = 200
const EDGE = 8

// The Android app anchors its menus to the pressed element; the popup is small,
// so the position is clamped into the viewport the same way.
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
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const height = menuRef.current?.offsetHeight || items.length * 40 + 8
    const below = rect.bottom + 4
    const top = below + height + EDGE <= window.innerHeight ? below : Math.max(rect.top - height - 4, EDGE)
    const left = Math.min(Math.max(rect.right - MENU_WIDTH, EDGE), window.innerWidth - MENU_WIDTH - EDGE)
    setPosition({ top, left })
  }, [items.length, open])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [open])

  return (
    <>
      {open ? <EscapeLayer onEscape={() => setOpen(false)} /> : null}
      <button
        ref={anchorRef}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        {trigger}
      </button>
      {open && (
        <div ref={menuRef} className="anchor-menu" role="menu" style={{ top: position.top, left: position.left }}>
          {items.length ? (
            items.map((item, index) => (
              <button
                key={item.id || `${item.label}-${index}`}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : undefined}
                onClick={() => {
                  setOpen(false)
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
      )}
    </>
  )
}

function EscapeLayer({ onEscape }: { onEscape: () => void }) {
  useEscape(onEscape)
  return null
}
