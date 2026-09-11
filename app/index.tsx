import { useCallback, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import { ui$ } from '@/states/ui'
import { NoriHome } from '@/components/home/NoriHome'
import { usePendingShareIntent } from '@/hooks/usePendingShareIntent'
import { useQuickShare } from '@/hooks/useQuickShare'

// Distance (px) a slow drag must cover before the drawer opens.
const DRAWER_OPEN_DISTANCE = 110
// A quick flick opens earlier, but still needs some travel and real speed.
const DRAWER_OPEN_FLICK_DISTANCE = 48
const DRAWER_OPEN_VELOCITY = 900

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

  // A short nudge upward used to be enough to open the drawer, which fired by
  // accident while scrolling. Opening now needs a deliberate swipe: either a
  // long enough drag or a fast flick.
  const openTriggered = useRef(false)
  const openDrawerGesture = Gesture.Pan()
    .enabled(!bookmarkEditMode && bookmarkListAtBottom)
    .activeOffsetY([-24, 10000])
    .failOffsetX([-60, 60])
    .runOnJS(true)
    .onBegin(() => {
      openTriggered.current = false
    })
    .onUpdate((event) => {
      if (openTriggered.current) {
        return
      }
      if (event.translationY <= -DRAWER_OPEN_DISTANCE) {
        openTriggered.current = true
        toggleDrawer(true)
      }
    })
    .onEnd((event) => {
      if (openTriggered.current) {
        return
      }
      if (event.velocityY <= -DRAWER_OPEN_VELOCITY && event.translationY <= -DRAWER_OPEN_FLICK_DISTANCE) {
        openTriggered.current = true
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
