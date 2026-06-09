import '@/lib/i18n'
import './global.css'

import { Appearance, Linking, LogBox, View } from 'react-native'
import { Slot } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useValue } from '@legendapp/state/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useEffect } from 'react'
import { colorScheme as nativeWindColorScheme } from 'nativewind'
import { onReceiveAuthUrl } from '@/lib/supabase/auth'
import { startSupabaseSyncWatchers, syncSupabase } from '@/lib/supabase/sync'
import { useAppColorScheme } from '@/lib/theme'
import { auth$, bootstrapAuth } from '@/states/auth'
import { settings$ } from '@/states/settings'

LogBox.ignoreAllLogs()

function LayoutContent() {
  const appColorScheme = useAppColorScheme()
  const userId = useValue(auth$.userId)
  const plan = useValue(auth$.plan)
  const theme = useValue(settings$.theme)

  const colorScheme = theme || appColorScheme

  useEffect(() => {
    nativeWindColorScheme.set(theme || 'system')
  }, [theme])

  useEffect(() => {
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
    <View className="flex-1 bg-stone-50 dark:bg-stone-950">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
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
