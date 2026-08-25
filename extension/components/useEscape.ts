import { useEffect, useRef } from 'react'

// Only the topmost layer reacts to Escape, so closing a menu inside a sheet does
// not also close the sheet.
const stack: object[] = []

export function useEscape(onEscape: () => void) {
  const handler = useRef(onEscape)
  handler.current = onEscape
  useEffect(() => {
    const token = {}
    stack.push(token)
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || stack[stack.length - 1] !== token) return
      event.preventDefault()
      handler.current()
    }
    document.addEventListener('keydown', listener)
    return () => {
      const index = stack.indexOf(token)
      if (index >= 0) stack.splice(index, 1)
      document.removeEventListener('keydown', listener)
    }
  }, [])
}
