import { useCallback, useEffect } from 'react'
import { BackHandler } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import { ui$ } from '@/states/ui'
import { NoriHome } from '@/components/home/NoriHome'
import { usePendingShareIntent } from '@/hooks/usePendingShareIntent'
import { useQuickShare } from '@/hooks/useQuickShare'

export default function HomeScreen() {
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const bookmarkListAtBottom = useValue(ui$.bookmarkListAtBottom)
  const toggleDrawer = useCallback((open: boolean) => {
    if (open) {
      ui$.openBookmarksDrawer()
    } else {
      ui$.drawerOpen.set(false)
    }
  }, [])

  const openDrawerGesture = Gesture.Pan()
    .enabled(!bookmarkEditMode && bookmarkListAtBottom)
    .activeOffsetY([-18, 10000])
    .failOffsetX([-80, 80])
    .runOnJS(true)
    .onStart(() => {
      toggleDrawer(true)
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
      if (ui$.pendingBookmarkImport.get()) {
        ui$.pendingBookmarkImport.set(null)
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

  useQuickShare()
  usePendingShareIntent()

  return <NoriHome renderMain={(main) => <GestureDetector gesture={openDrawerGesture}>{main}</GestureDetector>} />
}
