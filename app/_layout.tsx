import '@/lib/i18n'
import './global.css'

import { AppState, Appearance, Linking, LogBox, Platform, View } from 'react-native'
import { Slot } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useValue } from '@legendapp/state/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useEffect, useMemo, useState } from 'react'
import { useLocales } from 'expo-localization'
import i18n from 'i18next'
import { colorScheme as nativeWindColorScheme, vars } from 'nativewind'
import { onReceiveAuthUrl } from '@/lib/supabase/auth'
import { startSupabaseSyncWatchers, syncSupabase } from '@/lib/supabase/sync'
import { useAccountChoicePrompt } from '@/hooks/useAccountChoicePrompt'
import { purgeExpiredTombstones } from '@/lib/tombstone-purge'
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { accentVariables, applyAccentToDocument, normalizeAccent } from '@/lib/accent'
import { readSystemPalette } from '@/lib/dynamic-palette'
import { systemPalette$ } from '@/lib/system-palette'
import { auth$, bootstrapAuth, restoreSession } from '@/states/auth'
import { listenIosTransactions, reconcileIosTransactions } from '@/lib/ios-billing'
import { normalizeFontScale } from '@/lib/typography'
import { settings$ } from '@/states/settings'
import { bookmarks$ } from '@/states/bookmarks'
import { isDeleted } from '@/lib/nori-data'
import { previewSource, warmShownPreviews } from '@/lib/bookmark-preview'
import { warmSavedPosts } from '@/lib/shown-saved-posts'
import { localCaptureOwner } from '@/lib/social-post-autosave'
import { resolveI18nLanguageFromExpoLocale } from '@/lib/i18n'
import { useBlocklistSync } from '@/hooks/useBlocklistSync'
import { WebViewTitleResolver } from '@/components/WebViewTitleResolver'
import { PreviewPageSheet } from '@/components/sheet/PreviewPageSheet'
import { SocialCaptureSheet } from '@/components/sheet/SocialCaptureSheet'
import { ActionSnackbar } from '@/components/common/ActionSnackbar'

LogBox.ignoreAllLogs()

// Preview tiles read their saved preview from files, so on a cold start they first render without
// an image and then fill in. Keep the splash up and the tiles unmounted until those reads are done
// (capped at a second), so they mount with their preview and final size.
const holdSplash = Platform.OS !== 'web' && settings$.bookmarkView.peek() === 'preview'
if (holdSplash) void SplashScreen.preventAutoHideAsync().catch(() => {})

// Coming back to the app syncs at most this often.
const RETURN_SYNC_THROTTLE_MS = 30 * 1000

const WARM_TIMEOUT_MS = 1000

function warmPreviews() {
  const fallback = settings$.previewImageSource.peek()
  const live = bookmarks$.bookmarks.peek().filter((row) => !isDeleted(row))
  // The list the app opens on is what shows under the splash, so it goes first and the rest of the
  // library only takes what is left of the second.
  const selectedListId = settings$.lastSelectedListId.peek()
  const opening = live.filter((row) => row.listId === selectedListId)
  const rest = live.filter((row) => row.listId !== selectedListId)
  const items = [...opening, ...rest].map((row) => ({ url: row.url, source: previewSource(row.json?.previewSource, fallback) }))
  // A saved post shows only for its owner, so the session is read before the posts: without it, a
  // signed-in account's posts would mount as page previews and turn into posts once auth caught up.
  const posts = restoreSession()
    .catch(() => undefined)
    .then(async () => {
      const owner = localCaptureOwner()
      await warmSavedPosts(opening.map((row) => row.url), owner)
      await warmSavedPosts(rest.map((row) => row.url), owner)
    })
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    Promise.all([warmShownPreviews(items, WARM_TIMEOUT_MS), posts]),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, WARM_TIMEOUT_MS))),
  ]).finally(() => clearTimeout(timer))
}

function LayoutContent() {
  useBlocklistSync()
  const appColorScheme = useAppColorScheme()
  const themeColors = useThemeColors()
  const userId = useValue(auth$.userId)
  const plan = useValue(auth$.plan)
  useAccountChoicePrompt()
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

  const [previewsReady, setPreviewsReady] = useState(!holdSplash)
  useEffect(() => {
    if (holdSplash) void warmPreviews().finally(() => setPreviewsReady(true))
  }, [])
  useEffect(() => {
    if (holdSplash && previewsReady) {
      // After the tiles have committed, so the first frame shown is the final one.
      const frame = requestAnimationFrame(() => void SplashScreen.hideAsync().catch(() => {}))
      return () => cancelAnimationFrame(frame)
    }
  }, [previewsReady])

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

    let lastRunAt = 0
    const runSync = () => {
      lastRunAt = Date.now()
      void syncSupabase().catch(() => undefined)
    }
    runSync()
    const timer = setInterval(runSync, 10 * 60 * 1000)
    // Coming back to the app is when another device's changes are most likely waiting.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastRunAt >= RETURN_SYNC_THROTTLE_MS) runSync()
    })

    return () => {
      clearInterval(timer)
      appState.remove()
    }
  }, [plan, userId])

  return (
    <View className="flex-1 bg-canvas" style={accentStyle}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <WebViewTitleResolver canvasColor={themeColors.canvas} />
      <PreviewPageSheet />
      {Platform.OS === 'web' ? null : <SocialCaptureSheet />}
      {previewsReady ? <Slot /> : null}
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
