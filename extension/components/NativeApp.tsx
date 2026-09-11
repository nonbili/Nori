import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { colorScheme } from 'nativewind'
import { applyAccentToDocument, normalizeAccent } from 'nori-root/lib/accent'
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
    if (mode !== 'popup') return

    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!/^https?:/i.test(tab?.url || '')) return
      setActiveTab({ url: tab?.url, title: tab?.title, icon: tab?.favIconUrl })
    })
  }, [mode])

  useEffect(() => {
    const language = state.snapshot.preferences.language || systemLanguage()
    document.documentElement.lang = language.replace('_', '-')
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [state.snapshot.preferences.language])

  // Tracked in state rather than read where it is needed: the accent's fill
  // flips with the scheme, so a system-scheme change has to re-apply it and
  // not only re-toggle the class.
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const theme = state.snapshot.preferences.theme
    colorScheme.set(theme)
    const systemDark = matchMedia('(prefers-color-scheme: dark)')
    const resolve = () => setIsDark(theme === 'dark' || (theme === 'system' && systemDark.matches))
    resolve()
    if (theme !== 'system') return
    systemDark.addEventListener('change', resolve)
    return () => systemDark.removeEventListener('change', resolve)
  }, [state.snapshot.preferences.theme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // On the root element rather than a React subtree so the plain-DOM parts of
  // the popup (app.css) and the react-native-web tree both inherit them.
  useEffect(() => {
    applyAccentToDocument(normalizeAccent(state.snapshot.preferences.accent), isDark ? 'dark' : 'light')
  }, [state.snapshot.preferences.accent, isDark])

  return (
    <AppProvider value={state}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NoriHome
            newBookmarkDefaults={activeTab}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsSheet={settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
            menuItems={
              mode === 'popup'
                ? [
                    {
                      label: t('settings.openInTab'),
                      icon: 'open-in-new',
                      handler: () => {
                        void browser.tabs.create({ url: browser.runtime.getURL('/tab.html') })
                        window.close()
                      },
                    },
                  ]
                : undefined
            }
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
    return <View className="flex-1 bg-canvas" />
  }
  return <ReadyApp state={{ ...state, snapshot: state.snapshot }} mode={mode} />
}
