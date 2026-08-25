import { useSyncExternalStore } from 'react'

export interface SnackbarState {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

let snackbars: SnackbarState[] = []
const listeners = new Set<() => void>()
let nextId = 1

const emit = () => listeners.forEach((listener) => listener())

export function dismissSnackbar(id: number) {
  snackbars = snackbars.filter((item) => item.id !== id)
  emit()
}

export function showSnackbar(message: string, actionLabel?: string, onAction?: () => void) {
  const id = nextId++
  snackbars = [...snackbars, { id, message, actionLabel, onAction }].slice(-2)
  emit()
  window.setTimeout(() => dismissSnackbar(id), 5000)
}

export const showToast = (message: string) => showSnackbar(message)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function Snackbars({ raised }: { raised?: boolean }) {
  const items = useSyncExternalStore(subscribe, () => snackbars)
  if (!items.length) return null
  return (
    <div className={`snackbar-stack ${raised ? 'raised' : ''}`}>
      {items.map((snackbar) => (
        <div className="snackbar" key={snackbar.id}>
          <span>{snackbar.message}</span>
          {snackbar.actionLabel && (
            <button
              onClick={() => {
                dismissSnackbar(snackbar.id)
                snackbar.onAction?.()
              }}
            >
              {snackbar.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
