import '@/lib/i18n'
import './global.css'

import { AppState, Appearance, Linking, LogBox, View } from 'react-native'
import { Slot } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useValue } from '@legendapp/state/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useEffect, useMemo } from 'react'
import { useLocales } from 'expo-localization'
import i18n from 'i18next'
import { colorScheme as nativeWindColorScheme, vars } from 'nativewind'
import { onReceiveAuthUrl } from '@/lib/supabase/auth'
import { startSupabaseSyncWatchers, syncSupabase } from '@/lib/supabase/sync'
import { purgeExpiredTombstones } from '@/lib/tombstone-purge'
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { accentVariables, applyAccentToDocument, normalizeAccent } from '@/lib/accent'
import { readSystemPalette } from '@/lib/dynamic-palette'
import { systemPalette$ } from '@/lib/system-palette'
import { auth$, bootstrapAuth } from '@/states/auth'
import { listenIosTransactions, reconcileIosTransactions } from '@/lib/ios-billing'
import { normalizeFontScale } from '@/lib/typography'
import { settings$ } from '@/states/settings'
import { resolveI18nLanguageFromExpoLocale } from '@/lib/i18n'
import { WebViewTitleResolver } from '@/components/WebViewTitleResolver'
import { ActionSnackbar } from '@/components/common/ActionSnackbar'

LogBox.ignoreAllLogs()

function LayoutContent() {
  const appColorScheme = useAppColorScheme()
  const themeColors = useThemeColors()
  const userId = useValue(auth$.userId)
  const plan = useValue(auth$.plan)
  const theme = useValue(settings$.theme)
  const accent = useValue(settings$.accent)
  const fontScale = useValue(settings$.fontScale)
  const selectedLanguage = useValue(settings$.language)
  const locales = useLocales()

  const colorScheme = theme === 'amoled' ? 'dark' : theme || appColorScheme
  // Overrides the --nori-accent-* defaults from lib/tokens.css for the native
  // tree, where NativeWind propagates them through React context so a portalled
  // sheet still sees the user's accent.
  const systemPalette = useValue(systemPalette$)
  const accentStyle = useMemo(
    () => vars(accentVariables(normalizeAccent(accent), colorScheme, theme === 'amoled')),
    // The palette is read inside accentVariables, so it has to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, colorScheme, systemPalette, theme],
  )

  // On web the cascade resolves them instead, and react-native-web renders
  // modals outside this View, so the root element has to carry them too.
  useEffect(() => {
    applyAccentToDocument(normalizeAccent(accent), colorScheme, theme === 'amoled')
  }, [accent, colorScheme, systemPalette, theme])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--nori-font-scale', String(normalizeFontScale(fontScale)))
    }
  }, [fontScale])

  // The wallpaper can change while the app is in the background, so read it
  // again on return. Compared by value: a new object would repaint everything.
  useEffect(() => {
    const refresh = () => {
      const next = readSystemPalette()
      if (JSON.stringify(next) !== JSON.stringify(systemPalette$.peek())) {
        systemPalette$.set(next)
      }
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    const systemLanguage = resolveI18nLanguageFromExpoLocale(locales[0]) || 'en'
    const language = selectedLanguage || systemLanguage
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [locales, selectedLanguage])

  useEffect(() => {
    nativeWindColorScheme.set(theme === 'amoled' ? 'dark' : theme || 'system')
  }, [theme])

  useEffect(() => listenIosTransactions(), [])

  // Deliver purchases a failed sync or a killed app left unfinished.
  useEffect(() => {
    if (userId) {
      void reconcileIosTransactions()
    }
  }, [userId])

  useEffect(() => {
    // Before the watchers start, so compacting old tombstones does not mark every
    // row pending and schedule a full push.
    purgeExpiredTombstones()
    startSupabaseSyncWatchers()
    void bootstrapAuth()

    const handleUrl = ({ url }: { url: string }) => {
      void onReceiveAuthUrl(url)
    }

    const subscription = Linking.addEventListener('url', handleUrl)
    void Linking.getInitialURL().then((url) => {
      if (url) {
        void onReceiveAuthUrl(url)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (!userId || !plan || plan === 'free') {
      return
    }

    void syncSupabase().catch(() => undefined)
    const timer = setInterval(() => {
      void syncSupabase().catch(() => undefined)
    }, 10 * 60 * 1000)

    return () => clearInterval(timer)
  }, [plan, userId])

  return (
    <View className="flex-1 bg-canvas" style={accentStyle}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <WebViewTitleResolver canvasColor={themeColors.canvas} />
      <Slot />
      <ActionSnackbar />
    </View>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LayoutContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
