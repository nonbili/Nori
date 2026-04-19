import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'

export interface Settings {
  theme: null | 'dark' | 'light'
  lastSelectedListId: string
  enabledSearchProviderIds: string[]
  selectedSearchProviderId: string
  customSearchProviders: any[]
  openInSystemBrowser: boolean
}

interface Store extends Settings {
  cycleTheme: () => void
  setLastSelectedListId: (id: string) => void
  setSelectedSearchProvider: (id: string) => void
  setOpenInSystemBrowser: (enabled: boolean) => void
}

const themes: Array<Settings['theme']> = [null, 'light', 'dark']

export const settings$: Observable<Store> = observable<Store>({
  theme: null,
  lastSelectedListId: 'default',
  enabledSearchProviderIds: ['url', 'duckduckgo', 'google'],
  selectedSearchProviderId: 'google',
  customSearchProviders: [],
  openInSystemBrowser: false,
  cycleTheme: () => {
    const current = settings$.theme.get()
    const index = themes.indexOf(current)
    settings$.theme.set(themes[(index + 1) % themes.length])
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
})

syncObservable(settings$, {
  persist: {
    name: 'settings',
    plugin: ObservablePersistMMKV,
  },
})
