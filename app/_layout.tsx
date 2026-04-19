import '@/lib/i18n'
import './global.css'

import { Appearance, Linking, LogBox, View, useColorScheme } from 'react-native'
import { Slot } from 'expo-router'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useObserveEffect, useValue } from '@legendapp/state/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useEffect } from 'react'
import { onReceiveAuthUrl } from '@/lib/supabase/auth'
import { startSupabaseSyncWatchers, syncSupabase } from '@/lib/supabase/sync'
import { auth$, bootstrapAuth } from '@/states/auth'
import { settings$ } from '@/states/settings'

LogBox.ignoreAllLogs()

function LayoutContent() {
  const colorScheme = useColorScheme()
  const userId = useValue(auth$.userId)
  const plan = useValue(auth$.plan)

  useObserveEffect(settings$.theme, ({ value }) => {
    Appearance.setColorScheme(value ?? ('unspecified' as never))
  })

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
    <SafeAreaView className="flex-1 bg-stone-50 dark:bg-stone-950">
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View className="flex-1 bg-stone-50 dark:bg-stone-950">
        <Slot />
      </View>
    </SafeAreaView>
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
