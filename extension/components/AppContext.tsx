import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { getLiveBookmarks, getVisibleLists } from 'nori/lib/nori-data'
import { useSnapshot } from './useSnapshot'
import { request } from '../lib/client'
import type { AppSnapshot, NoriBookmark, NoriList, RequestMessage } from '../lib/model'

interface AppContextValue {
  snapshot: AppSnapshot
  lists: NoriList[]
  bookmarks: NoriBookmark[]
  refresh: () => Promise<void>
  mutate: (message: RequestMessage) => Promise<unknown>
  setError: (message: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({
  value,
  children,
}: {
  value: { snapshot: AppSnapshot; refresh: () => Promise<void>; setError: (message: string) => void }
  children: ReactNode
}) {
  const { snapshot, refresh, setError } = value
  const mutate = useCallback(
    async (message: RequestMessage) => {
      try {
        const data = await request(message)
        await refresh()
        return data
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
        return undefined
      }
    },
    [refresh, setError],
  )
  const context = useMemo<AppContextValue>(
    () => ({
      snapshot,
      lists: getVisibleLists(snapshot.profile.lists),
      bookmarks: getLiveBookmarks(snapshot.profile.bookmarks),
      refresh,
      mutate,
      setError,
    }),
    [mutate, refresh, setError, snapshot],
  )
  return <AppContext.Provider value={context}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('AppProvider is missing')
  return context
}
