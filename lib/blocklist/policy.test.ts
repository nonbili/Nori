import { describe, expect, it } from 'bun:test'
import { BLOCKLIST_BACKGROUND_REFRESH_MS, shouldAutoRefresh } from './policy'
import type { BlocklistSnapshot } from './types'

const source = (url: string) => ({ url })

function createSnapshot(overrides: Partial<BlocklistSnapshot> = {}): BlocklistSnapshot {
  return {
    enabled: true,
    phase: 'ready',
    hasSnapshot: true,
    revision: 1,
    schemaVersion: 1,
    lastUpdatedAt: 1_000,
    sources: {
      easylist: source('https://easylist.to/easylist/easylist.txt'),
      easyprivacy: source('https://easylist.to/easylist/easyprivacy.txt'),
      braveFirstparty: source('https://example.com/brave-firstparty.txt'),
      braveFirstpartyRegional: source('https://example.com/brave-firstparty-regional.txt'),
    },
    ...overrides,
  }
}

describe('shouldAutoRefresh', () => {
  it('refreshes once the weekly interval has passed', () => {
    const state = createSnapshot()
    expect(shouldAutoRefresh(state, 1_000 + BLOCKLIST_BACKGROUND_REFRESH_MS - 1)).toBe(false)
    expect(shouldAutoRefresh(state, 1_000 + BLOCKLIST_BACKGROUND_REFRESH_MS)).toBe(true)
  })

  it('refreshes when there is no snapshot yet', () => {
    expect(shouldAutoRefresh(createSnapshot({ hasSnapshot: false, lastUpdatedAt: undefined }), 2_000)).toBe(true)
  })

  it('does not refresh while disabled or already fetching', () => {
    const later = 1_000 + BLOCKLIST_BACKGROUND_REFRESH_MS
    expect(shouldAutoRefresh(createSnapshot({ enabled: false }), later)).toBe(false)
    expect(shouldAutoRefresh(createSnapshot({ phase: 'fetching' }), later)).toBe(false)
  })
})
