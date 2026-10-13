import { openBrowserAsync } from 'expo-web-browser'
import { Linking, Platform } from 'react-native'
import { settings$ } from '@/states/settings'
import { openTab } from '@/modules/nori-browser'

export async function openUrl(url: string) {
  if (settings$.openInSystemBrowser.get()) {
    await Linking.openURL(url)
    return
  }

  if (Platform.OS === 'android') {
    if (openTab(url)) {
      return
    }
  }

  await openBrowserAsync(url, {
    showInRecents: true,
    createTask: true,
    useProxyActivity: true,
    enableBarCollapsing: true,
  })
}
