import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView as NativeScrollView, Share, Text, TextInput, View, useWindowDimensions } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { FlashList } from '@shopify/flash-list'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { Directions, Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler'
import { useValue } from '@legendapp/state/react'

import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { ui$ } from '@/states/ui'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'
import { ManageRow } from '@/components/common/Common'
import { Favicon } from '@/components/bookmark/Favicon'
import { ListChip } from '@/components/list/ListChip'
import { type ThemeColors, useThemeColors } from '@/lib/theme'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { getLiveBookmarks, getVisibleLists } from '@/lib/nori-data'
import { showToast } from '@/lib/toast'
import { HEADER_TOP_OFFSET } from '@/components/header/headerLayout'

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const getCreatedAtMs = (value?: string) => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

const BookmarkItem = memo(({
  bookmark,
  themeColors,
  onOpen,
  onShare,
  onDelete,
}: {
  bookmark: BookmarkRecord
  themeColors: ThemeColors
  onOpen: (b: BookmarkRecord) => void
  onShare: (b: BookmarkRecord) => void
  onDelete: (b: BookmarkRecord) => void
}) => (
  <ManageRow
    title={bookmark.title}
    subtitle={getHostLabel(bookmark.url)}
    left={
      <Favicon
        iconUrl={bookmark.icon}
        pageUrl={bookmark.url}
        slotSize={40}
        iconSize={24}
        fallbackIconSize={16}
        wrapperClassName="items-center justify-center overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800"
      />
    }
    onPress={() => onOpen(bookmark)}
    actions={
      <NouMenu
        items={[
          {
            label: 'Share',
            icon: 'share' as const,
            handler: () => onShare(bookmark),
          },
          {
            label: 'Delete',
            icon: 'delete' as const,
            handler: () => onDelete(bookmark),
          },
        ]}
        trigger={
          <View className="h-8 w-8 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
            <MaterialIcons name="more-vert" size={18} color={themeColors.iconMuted} />
          </View>
        }
      />
    }
  />
))
BookmarkItem.displayName = 'BookmarkItem'

const ListSeparator = memo(() => <View style={{ height: 12 }} />)
ListSeparator.displayName = 'ListSeparator'

export function AllBookmarksDrawer() {
  const themeColors = useThemeColors()
  const bookmarks = useValue(bookmarks$.bookmarks)
  const lists = useValue(lists$.lists)
  const drawerOpen = useValue(ui$.drawerOpen)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortType, setSortType] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest')
  const [filterListId, setFilterListId] = useState<string>('all')
  const scrollOffset = useSharedValue(0)
  const scrollRef = useRef(null)
  const { height: windowHeight } = useWindowDimensions()
  const drawerTranslateY = useSharedValue(windowHeight)
  const visibleLists = getVisibleLists(lists)

  useEffect(() => {
    drawerTranslateY.value = withSpring(drawerOpen ? 0 : windowHeight, {
      damping: 20,
      stiffness: 90,
      overshootClamping: true,
    })
    if (!drawerOpen) {
      setSearchQuery('')
    } else {
      scrollOffset.value = 0
    }
  }, [drawerOpen, drawerTranslateY, windowHeight])

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerTranslateY.value }],
  }))

  const closeDrawer = () => ui$.drawerOpen.set(false)

  // Fling-down on the tab row dismisses the drawer (does not block child presses)
  const closeDrawerGesture = Gesture.Fling()
    .direction(Directions.DOWN)
    .onStart(() => {
      'worklet'
      if (scrollOffset.value <= 0) {
        runOnJS(closeDrawer)()
      }
    })

  // Pan with manualActivation — stays passive (won't block child taps) until
  // we explicitly call manager.activate(), which only happens when the list
  // is scrolled to the top and the user drags downward.
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
          runOnJS(closeDrawer)()
        } else {
          drawerTranslateY.value = withSpring(0, {
            damping: 18,
            stiffness: 120,
            overshootClamping: true,
          })
        }
      }
    })

  const filteredBookmarks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let result = getLiveBookmarks(bookmarks).filter((b) => {
      if (filterListId !== 'all' && b.listId !== filterListId) {
        return false
      }
      if (!query) {
        return true
      }
      return b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)
    })

    result.sort((a, b) => {
      switch (sortType) {
        case 'az':
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        case 'za':
          return b.title.toLowerCase().localeCompare(a.title.toLowerCase())
        case 'newest':
          return getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt)
        case 'oldest':
          return getCreatedAtMs(a.createdAt) - getCreatedAtMs(b.createdAt)
        default:
          return 0
      }
    })

    return result
  }, [bookmarks, filterListId, searchQuery, sortType])

  const sortLabel = {
    newest: 'Newest',
    oldest: 'Oldest',
    az: 'A-Z',
    za: 'Z-A',
  }[sortType]

  const sortMenuItems: NouMenuItem[] = useMemo(() => [
    { label: 'Newest first', handler: () => setSortType('newest'), selected: sortType === 'newest' },
    { label: 'Oldest first', handler: () => setSortType('oldest'), selected: sortType === 'oldest' },
    { label: 'Name A-Z', handler: () => setSortType('az'), selected: sortType === 'az' },
    { label: 'Name Z-A', handler: () => setSortType('za'), selected: sortType === 'za' },
  ], [sortType])

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
          bookmarks$.delete(bookmark.id)
          showToast('Bookmark deleted')
        },
      },
    ])
  }, [])
  const handleOpenBookmark = useCallback((bookmark: BookmarkRecord) => {
    void openBookmarkAction(bookmark)
  }, [])

  const renderBookmarkRow = useCallback(({ item: bookmark }: { item: BookmarkRecord }) => (
    <BookmarkItem
      bookmark={bookmark}
      themeColors={themeColors}
      onOpen={handleOpenBookmark}
      onShare={shareBookmark}
      onDelete={deleteBookmark}
    />
  ), [themeColors, handleOpenBookmark, shareBookmark, deleteBookmark])

  const handleScroll = useCallback((event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y
  }, [scrollOffset])

  const renderScrollComponent = useCallback((props: any) => (
    <ScrollView {...props} ref={scrollRef} />
  ), [])

  return (
    <Animated.View className="absolute inset-0 z-[100] bg-stone-50 dark:bg-stone-950" style={drawerAnimatedStyle}>
      <View className="flex-1 px-6">
        <View className="flex-1" style={{ paddingTop: HEADER_TOP_OFFSET }}>
          <View className="mb-6 flex-row items-center gap-3">
            <Pressable
              onPress={() => ui$.drawerOpen.set(false)}
              className="h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
            >
              <MaterialIcons name="arrow-back" size={20} color={themeColors.iconMuted} />
            </Pressable>
            <View className="h-12 flex-1 flex-row items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 dark:border-stone-800 dark:bg-stone-900">
              <MaterialIcons name="search" size={20} color={themeColors.iconMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search..."
                placeholderTextColor={themeColors.placeholder}
                className="flex-1 text-base text-stone-900 dark:text-stone-50"
                autoFocus={false}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <NouMenu
              items={sortMenuItems}
              trigger={
                <View className="h-12 flex-row items-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3 dark:border-stone-800 dark:bg-stone-900">
                  <MaterialIcons name="sort" size={18} color={themeColors.iconMuted} />
                  <Text className="text-sm font-medium text-stone-700 dark:text-stone-300">{sortLabel}</Text>
                  <MaterialIcons name="arrow-drop-down" size={18} color={themeColors.iconMuted} />
                </View>
              }
            />
          </View>

          <View className="mb-6">
            <GestureDetector gesture={closeDrawerGesture}>
              <NativeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                <ListChip
                  name="All"
                  isActive={filterListId === 'all'}
                  onPress={() => setFilterListId('all')}
                />
                {visibleLists.map((list) => (
                  <ListChip
                    key={list.id}
                    name={list.name}
                    isActive={filterListId === list.id}
                    onPress={() => setFilterListId(list.id)}
                  />
                ))}
              </NativeScrollView>
            </GestureDetector>
          </View>

          <GestureDetector gesture={closeDrawerPanGesture}>
            {filteredBookmarks.length > 0 ? (
              <View className="flex-1">
                <FlashList
                  data={filteredBookmarks}
                  renderItem={renderBookmarkRow}
                  keyExtractor={(item) => item.id}
                  estimatedItemSize={68}
                  contentContainerStyle={{ paddingBottom: 48 }}
                  ItemSeparatorComponent={ListSeparator}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  renderScrollComponent={renderScrollComponent}
                />
              </View>
            ) : (
              <View className="flex-1 items-center py-20">
                <MaterialIcons name="search-off" size={48} color={themeColors.iconSubtle} />
                <Text className="mt-4 text-base font-medium text-stone-500">No bookmarks found</Text>
                <Text className="mt-1 text-sm text-stone-600 dark:text-stone-500">Try a different filter or search</Text>
              </View>
            )}
          </GestureDetector>
        </View>
      </View>
    </Animated.View>
  )
}
