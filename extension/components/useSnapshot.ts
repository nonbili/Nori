import { useCallback, useEffect, useRef, useState } from 'react'
import { browser } from 'wxt/browser'
import { getSnapshot } from '../lib/client'
import type { AppSnapshot, StateChangedMessage } from '../lib/model'

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>()
  const [error, setError] = useState('')
  const requestSequence = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current
    try {
      const nextSnapshot = await getSnapshot()
      if (sequence !== requestSequence.current) return
      setSnapshot(nextSnapshot)
      setError('')
    } catch (reason) {
      if (sequence !== requestSequence.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])
  useEffect(() => () => void (requestSequence.current += 1), [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const onMessage = (message: unknown) => {
      if ((message as StateChangedMessage | undefined)?.type === 'state-changed') void refresh()
    }
    browser.runtime.onMessage.addListener(onMessage)
    return () => browser.runtime.onMessage.removeListener(onMessage)
  }, [refresh])
  return { snapshot, error, refresh, setError }
}
