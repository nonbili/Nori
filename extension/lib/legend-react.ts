import { useCallback, useSyncExternalStore } from 'react'

interface ObservableValue<T> {
  peek: () => T
  onChange: (listener: () => void) => () => void
}

// The extension compiles shared source from outside its package boundary. Use a
// direct external-store subscription so updates do not depend on module-global
// selector tracking surviving Vite's dependency graph.
export function useValue<T>(observable: ObservableValue<T>): T {
  const subscribe = useCallback((notify: () => void) => observable.onChange(notify), [observable])
  const getSnapshot = useCallback(() => observable.peek(), [observable])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
