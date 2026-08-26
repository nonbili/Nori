import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { colorScheme } from 'nativewind'
import { setDynamicLoadingEnabled } from '@react-native-vector-icons/common'
import { browser } from 'wxt/browser'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { NoriHome } from 'nori-root/components/home/NoriHome'
import { ActionSnackbar } from 'nori-root/components/common/ActionSnackbar'
import { AppProvider } from './AppContext'
import { SettingsSheet } from './SharedSettingsSheet'
import { useSnapshot } from './useSnapshot'
import { useSharedStateBridge } from './useSharedStateBridge'
import settingsI18n from '../lib/i18n'
import { systemLanguage } from '../lib/language'
import './native-fonts.css'
import './nativewind-interop'

setDynamicLoadingEnabled(false)

function ReadyApp({
  state,
  mode,
}: {
  state: ReturnType<typeof useSnapshot> & { snapshot: NonNullable<ReturnType<typeof useSnapshot>['snapshot']> }
  mode: 'popup' | 'tab'
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<{ url?: string; title?: string; icon?: string }>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  useSharedStateBridge(state.snapshot, state.refresh, state.setError)

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setActiveTab({ url: tab?.url, title: tab?.title, icon: tab?.favIconUrl })
    })
  }, [])

  // The shared components read the default i18next instance while the
  // extension's own settings sheet has its own; keep both on the language the
  // background stores, falling back to the browser UI language.
  useEffect(() => {
    const language = state.snapshot.preferences.language || systemLanguage()
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
    if (settingsI18n.language !== language) {
      void settingsI18n.changeLanguage(language)
    }
  }, [state.snapshot.preferences.language])

  useEffect(() => {
    const theme = state.snapshot.preferences.theme
    colorScheme.set(theme)
    document.documentElement.classList.toggle(
      'dark',
      theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches),
    )
  }, [state.snapshot.preferences.theme])

  return (
    <AppProvider value={state}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NoriHome
            newBookmarkDefaults={activeTab}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsSheet={settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
            headerMenuItems={mode === 'popup' ? [{
              label: t('settings.openInTab'),
              icon: 'open-in-new',
              handler: () => {
                void browser.tabs.create({ url: browser.runtime.getURL('/tab.html') })
                window.close()
              },
            }] : undefined}
          />
          <ActionSnackbar />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppProvider>
  )
}

export function NativeApp({ mode }: { mode: 'popup' | 'tab' }) {
  const state = useSnapshot()
  if (!state.snapshot) {
    return <View className="flex-1 bg-stone-50 dark:bg-stone-950" />
  }
  return <ReadyApp state={{ ...state, snapshot: state.snapshot }} mode={mode} />
}
