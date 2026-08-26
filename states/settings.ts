import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { Platform } from 'react-native'
import { normalizeI18nLanguage, type SupportedI18nLanguage } from '@/lib/i18n'

export interface Settings {
  theme: null | 'dark' | 'light'
  language: SupportedI18nLanguage | null
  lastSelectedListId: string
  enabledSearchProviderIds: string[]
  selectedSearchProviderId: string
  customSearchProviders: any[]
  openInSystemBrowser: boolean
  showFavicon: boolean
  quickSaveSharedLinks: boolean
  quickSaveShareListId: string
}

interface Store extends Settings {
  cycleTheme: () => void
  setLanguage: (language: SupportedI18nLanguage | null) => void
  setLastSelectedListId: (id: string) => void
  setSelectedSearchProvider: (id: string) => void
  setOpenInSystemBrowser: (enabled: boolean) => void
  setShowFavicon: (enabled: boolean) => void
  setQuickSaveSharedLinks: (enabled: boolean) => void
  setQuickSaveShareListId: (id: string) => void
}

const themes: Settings['theme'][] = [null, 'light', 'dark']

export const settings$: Observable<Store> = observable<Store>({
  theme: null,
  language: null,
  lastSelectedListId: 'default',
  enabledSearchProviderIds: ['url', 'duckduckgo', 'google'],
  selectedSearchProviderId: 'google',
  customSearchProviders: [],
  openInSystemBrowser: false,
  showFavicon: true,
  quickSaveSharedLinks: false,
  quickSaveShareListId: '',
  cycleTheme: () => {
    const current = settings$.theme.get()
    const index = themes.indexOf(current)
    settings$.theme.set(themes[(index + 1) % themes.length])
  },
  setLanguage: (language) => {
    settings$.language.set(normalizeI18nLanguage(language))
  },
  setLastSelectedListId: (id) => {
    settings$.lastSelectedListId.set(id || 'default')
  },
  setSelectedSearchProvider: (id) => {
    settings$.selectedSearchProviderId.set(id)
  },
  setOpenInSystemBrowser: (enabled) => {
    settings$.openInSystemBrowser.set(enabled)
  },
  setShowFavicon: (enabled) => {
    settings$.showFavicon.set(enabled)
  },
  setQuickSaveSharedLinks: (enabled) => {
    settings$.quickSaveSharedLinks.set(enabled)
  },
  setQuickSaveShareListId: (id) => {
    settings$.quickSaveShareListId.set(id)
  },
})

if (Platform.OS !== 'web') {
  syncObservable(settings$, {
    persist: {
      name: 'settings',
      plugin: ObservablePersistMMKV,
    },
  })
}
