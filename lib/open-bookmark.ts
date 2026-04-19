import { openBrowserAsync } from 'expo-web-browser'
import { Linking, Platform } from 'react-native'
import { settings$ } from '@/states/settings'
import { history$ } from '@/states/history'
import { openTab } from '@/modules/nori-browser'

interface BookmarkInfo {
  id: string
  url: string
  title: string
  icon: string
}

export async function openBookmark(bookmark: BookmarkInfo) {
  history$.addOpenedBookmark(bookmark)

  if (settings$.openInSystemBrowser.get()) {
    await Linking.openURL(bookmark.url)
    return
  }

  if (Platform.OS === 'android') {
    if (openTab(bookmark.url)) {
      return
    }
  }

  await openBrowserAsync(bookmark.url, {
    showInRecents: true,
    createTask: true,
    useProxyActivity: true,
    enableBarCollapsing: true,
  })
}
