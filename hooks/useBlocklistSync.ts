import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useObserveEffect } from '@legendapp/state/react'
import { applyBlocklist, refreshBlocklistIfDue, supportsRuntimeBlocklist, waitForBlocklistPersist } from '@/lib/blocklist'
import { blocklist$ } from '@/states/blocklist'

const REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Applies the saved blocklist on startup and keeps it up to date. The app can stay open for
 * weeks, so the weekly refresh is re-checked on an interval and whenever the app returns to
 * the foreground, not only once at startup.
 */
export function useBlocklistSync() {
  useEffect(() => {
    if (!supportsRuntimeBlocklist()) {
      return
    }

    let active = true
    const refreshIfDue = () => {
      if (active) void refreshBlocklistIfDue()
    }

    void (async () => {
      await waitForBlocklistPersist()
      if (!active) return
      await applyBlocklist()
      refreshIfDue()
    })()

    const intervalId = setInterval(refreshIfDue, REFRESH_CHECK_INTERVAL_MS)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIfDue()
    })

    return () => {
      active = false
      clearInterval(intervalId)
      subscription.remove()
    }
  }, [])

  useObserveEffect(() => {
    blocklist$.enabled.get()
    blocklist$.hasSnapshot.get()
    blocklist$.revision.get()
    void applyBlocklist()
  })
}
