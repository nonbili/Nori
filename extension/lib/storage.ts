import { browser } from 'wxt/browser'
import { createProfile } from './domain'
import type { StoredState } from './model'

const KEY = 'nori-state'

export const defaultState = (): StoredState => ({
  version: 1,
  activeProfileId: 'anonymous',
  profiles: { anonymous: createProfile() },
  preferences: {
    theme: 'system',
    language: browser.i18n.getUILanguage().replace('-', '_'),
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
