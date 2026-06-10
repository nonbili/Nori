import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Share, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { Directions, Gesture } from 'react-native-gesture-handler'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { ui$ } from '@/states/ui'
import { useThemeColors } from '@/lib/theme'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { showToast } from '@/lib/toast'
import { getTags } from '@/lib/nori-data'
import { HEADER_TOP_OFFSET } from '@/components/header/headerLayout'
import {
  DrawerBookmarkResults,
  DrawerFilterChips,
  DrawerHeader,
  DrawerTagChips,
} from '@/components/drawer/AllBookmarksDrawerParts'

type SortType = 'newest' | 'oldest' | 'az' | 'za'

export function AllBookmarksDrawer() {
  const themeColors = useThemeColors()
  const insets = useSafeAreaInsets()
  const drawerOpen = useValue(ui$.drawerOpen)
  const filterListId = useValue(ui$.drawerFilterListId)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortType, setSortType] = useState<SortType>('newest')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const scrollOffset = useSharedValue(0)
  const scrollRef = useRef(null)
  const { height: windowHeight } = useWindowDimensions()
  const drawerTranslateY = useSharedValue(windowHeight)

  useEffect(() => {
    if (drawerOpen) {
      drawerTranslateY.value = withSpring(0, {
        damping: 20,
        stiffness: 90,
        overshootClamping: true,
      })
    } else {
      drawerTranslateY.value = withTiming(windowHeight, { duration: 220 })
    }
    if (!drawerOpen) {
      setSearchQuery('')
      setFilterTags([])
    } else {
      scrollOffset.value = 0
    }
  }, [drawerOpen, drawerTranslateY, scrollOffset, windowHeight])

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerTranslateY.value }],
  }))

  const closeDrawer = () => ui$.drawerOpen.set(false)
  const closeDrawerWithAnimation = () => {
    drawerTranslateY.value = withTiming(windowHeight, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(closeDrawer)()
      }
    })
  }

  const closeDrawerGesture = Gesture.Fling()
    .direction(Directions.DOWN)
    .onStart(() => {
      'worklet'
      if (scrollOffset.value <= 0) {
        runOnJS(closeDrawerWithAnimation)()
      }
    })

  const closeDrawerPanGesture = Gesture.Pan()
    .manualActivation(true)
    .simultaneousWithExternalGesture(scrollRef)
    .onTouchesMove((_event, manager) => {
      'worklet'
      if (scrollOffset.value <= 0) {
        manager.activate()
      } else {
        manager.fail()
      }
    })
    .onUpdate((event) => {
      'worklet'
      if (event.translationY > 0) {
        drawerTranslateY.value = event.translationY
      }
    })
    .onEnd((event) => {
      'worklet'
      if (drawerTranslateY.value > 0) {
        if (event.translationY > 100 || event.velocityY > 500) {
          drawerTranslateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
            if (finished) {
              runOnJS(closeDrawer)()
            }
          })
        } else {
          drawerTranslateY.value = withSpring(0, {
            damping: 18,
            stiffness: 120,
            overshootClamping: true,
          })
        }
      }
    })

  const editBookmark = useCallback((bookmark: BookmarkRecord) => {
    ui$.drawerOpen.set(false)
    ui$.bookmarkEditor.set({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      icon: bookmark.icon || '',
      listId: bookmark.listId,
      tags: getTags(bookmark),
    })
  }, [])

  const copyBookmarkUrl = useCallback((bookmark: BookmarkRecord) => {
    void Clipboard.setStringAsync(bookmark.url)
    showToast('URL copied')
  }, [])

  const shareBookmark = useCallback(async (bookmark: { title: string; url: string }) => {
    try {
      await Share.share({
        title: bookmark.title,
        message: bookmark.url,
        url: bookmark.url,
      })
    } catch {}
  }, [])

  const deleteBookmark = useCallback((bookmark: { id: string; title: string }) => {
    Alert.alert('Delete bookmark?', `Remove ${bookmark.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          bookmarks$.remove(bookmark.id)
          showToast('Bookmark deleted')
        },
      },
    ])
  }, [])

  const handleOpenBookmark = useCallback((bookmark: BookmarkRecord) => {
    void openBookmarkAction(bookmark)
  }, [])

  const handleScroll = useCallback((event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y
  }, [scrollOffset])
  const setFilterListId = useCallback((value: string) => {
    ui$.drawerFilterListId.set(value)
  }, [])

  const drawerParts = {
    searchQuery,
    setSearchQuery,
    sortType,
    setSortType,
    filterListId,
    setFilterListId,
    filterTags,
    setFilterTags,
    themeColors,
    closeDrawerWithAnimation,
    closeDrawerGesture,
    closeDrawerPanGesture,
    scrollRef,
    onScroll: handleScroll,
    onOpen: handleOpenBookmark,
    onEdit: editBookmark,
    onCopyUrl: copyBookmarkUrl,
    onShare: shareBookmark,
    onDelete: deleteBookmark,
  }

  return (
    <Animated.View className="absolute inset-0 z-[100] bg-stone-50 dark:bg-stone-950" style={drawerAnimatedStyle}>
        <View className="flex-1 px-6">
          <View className="flex-1" style={{ paddingTop: insets.top + HEADER_TOP_OFFSET }}>
            <DrawerHeader drawer={drawerParts} />
            <DrawerFilterChips drawer={drawerParts} />
            <DrawerTagChips drawer={drawerParts} />
            <DrawerBookmarkResults drawer={drawerParts} />
          </View>
        </View>
      </Animated.View>
  )
}
