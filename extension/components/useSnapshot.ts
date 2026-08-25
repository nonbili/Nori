import { useCallback, useEffect, useState } from 'react'
import { getSnapshot } from '../lib/client'
import type { AppSnapshot } from '../lib/model'

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>()
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try { setSnapshot(await getSnapshot()); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { snapshot, error, refresh, setError }
}
