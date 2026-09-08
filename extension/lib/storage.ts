import { browser } from 'wxt/browser'
import { createProfile } from './domain'
import { normalizeLanguage } from './language'
import { DEFAULT_ACCENT, normalizeAccent } from 'nori-root/lib/accent'
import type { StoredState } from './model'

const KEY = 'nori-state'

export const defaultState = (): StoredState => ({
  version: 1,
  activeProfileId: 'anonymous',
  profiles: { anonymous: createProfile() },
  preferences: {
    theme: 'system',
    accent: DEFAULT_ACCENT,
    language: null,
    lastListId: 'builtin-later',
    showFavicons: true,
  },
})

export async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get(KEY)
  const stored = result[KEY] as StoredState | undefined
  if (!stored || stored.version !== 1 || !stored.profiles) return defaultState()
  if (!stored.profiles[stored.activeProfileId]) stored.activeProfileId = Object.keys(stored.profiles)[0] || 'anonymous'
  if (!stored.profiles.anonymous) stored.profiles.anonymous = createProfile()
  if (stored.preferences) {
    stored.preferences.language = normalizeLanguage(stored.preferences.language)
    // Added after v1 shipped, so state persisted before then has no accent.
    stored.preferences.accent = normalizeAccent(stored.preferences.accent)
  }
  return stored
}

export async function saveState(state: StoredState) {
  await browser.storage.local.set({ [KEY]: state })
}

export const supabaseStorage = {
  async getItem(key: string) {
    const result = await browser.storage.local.get(`auth:${key}`)
    return (result[`auth:${key}`] as string | undefined) ?? null
  },
  async setItem(key: string, value: string) {
    await browser.storage.local.set({ [`auth:${key}`]: value })
  },
  async removeItem(key: string) {
    await browser.storage.local.remove(`auth:${key}`)
  },
}
