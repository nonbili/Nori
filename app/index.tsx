import { useCallback, useEffect } from 'react'
import { BackHandler, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'

import { ui$ } from '@/states/ui'
import { AllBookmarksDrawer } from '@/components/drawer/AllBookmarksDrawer'
import { AppHeader } from '@/components/header/AppHeader'
import { BookmarkPager } from '@/components/home/BookmarkPager'
import { BookmarkEditorSheet } from '@/components/sheet/BookmarkEditorSheet'
import { ManageListsSheet } from '@/components/sheet/ManageListsSheet'
import { RecentlyUsedSheet } from '@/components/sheet/RecentlyUsedSheet'
import { SaveSharedLinkSheet } from '@/components/sheet/SaveSharedLinkSheet'
import { SettingsSheet } from '@/components/sheet/SettingsSheet'
import { ListEditorSheet } from '@/components/sheet/ListEditorSheet'
import { usePendingShareIntent } from '@/hooks/usePendingShareIntent'

export default function HomeScreen() {
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const toggleDrawer = useCallback((open: boolean) => {
    ui$.drawerOpen.set(open)
  }, [])

  const openDrawerGesture = Gesture.Fling()
    .direction(Directions.UP)
    .runOnJS(true)
    .onStart(() => {
      if (!bookmarkEditMode) {
        toggleDrawer(true)
      }
    })

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (ui$.drawerOpen.get()) {
        toggleDrawer(false)
        return true
      }
      if (ui$.pendingShare.get()) {
        ui$.pendingShare.set(null)
        return true
      }
      if (ui$.bookmarkEditor.get()) {
        ui$.bookmarkEditor.set(null)
        return true
      }
      if (ui$.listEditor.get()) {
        ui$.listEditor.set(null)
        return true
      }
      if (ui$.settingsSheetOpen.get()) {
        ui$.settingsSheetOpen.set(false)
        return true
      }
      if (ui$.listManagerOpen.get()) {
        ui$.listManagerOpen.set(false)
        return true
      }
      if (ui$.recentSheetOpen.get()) {
        ui$.recentSheetOpen.set(false)
        return true
      }
      return false
    })

    return () => {
      subscription.remove()
    }
  }, [toggleDrawer])

  usePendingShareIntent()

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950">
      <GestureDetector gesture={openDrawerGesture}>
        <View className="flex-1">
          {!bookmarkEditMode ? <AppHeader /> : null}
          <BookmarkPager />
        </View>
      </GestureDetector>

      <AllBookmarksDrawer />

      <RecentlyUsedSheet />
      <SettingsSheet />
      <ManageListsSheet />
      <BookmarkEditorSheet />
      <ListEditorSheet />

      <SaveSharedLinkSheet />
    </View>
  )
}
