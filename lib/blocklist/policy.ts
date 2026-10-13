import type { BlocklistSnapshot } from './types'

export const BLOCKLIST_BACKGROUND_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

export function shouldAutoRefresh(state: BlocklistSnapshot, now = Date.now()) {
  if (!state.enabled || state.phase === 'fetching') {
    return false
  }

  if (!state.hasSnapshot || !state.lastUpdatedAt) {
    return true
  }

  return now - state.lastUpdatedAt >= BLOCKLIST_BACKGROUND_REFRESH_MS
}
