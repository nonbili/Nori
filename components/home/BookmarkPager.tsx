import { Alert, FlatList, InteractionManager, Pressable, ScrollView, Share, Text, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getSortIndex, getVisibleLists, isDeleted, isVisible } from '@/lib/nori-data'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { useThemeColors } from '@/lib/theme'
import { showToast } from '@/lib/toast'
import { BookmarkTile } from '@/components/bookmark/BookmarkItem'
import { ListChip } from '@/components/list/ListChip'
import { SortableGrid } from '@/components/bookmark/SortableGrid'
import { SectionLabel } from '@/components/common/Common'
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue, type AnimatedRef } from 'react-native-reanimated'

const TILE_HEIGHT = 46
const GRID_COLUMNS = 2
const GRID_GAP = 16
const PAGE_HORIZONTAL_PADDING = 24
const PAGE_RENDER_RADIUS = 1
const INITIAL_BOOKMARKS_TO_RENDER = 6
const BOOKMARKS_RENDER_BATCH = 4
const BOTTOM_EDGE_THRESHOLD = 24
const LARGE_EDIT_LIST_THRESHOLD = 120

type BookmarkGroups = Map<string, {
  visible: BookmarkRecord[]
  available: BookmarkRecord[]
}>

function sortBookmarks(a: BookmarkRecord, b: BookmarkRecord) {
  return getSortIndex(a) - getSortIndex(b)
}

function groupBookmarksByList(bookmarks: BookmarkRecord[]) {
  const groups: BookmarkGroups = new Map()

  for (const bookmark of bookmarks) {
    if (isDeleted(bookmark)) {
      continue
    }

    const group = groups.get(bookmark.listId) || { visible: [], available: [] }
    if (isVisible(bookmark)) {
      group.visible.push(bookmark)
    } else {
      group.available.push(bookmark)
    }
    groups.set(bookmark.listId, group)
  }

  for (const group of groups.values()) {
    group.visible.sort(sortBookmarks)
    group.available.sort(sortBookmarks)
  }

  return groups
}

const AddLinkButton = memo(({
  onPress,
  iconColor,
}: {
  onPress: () => void
  iconColor: string
}) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center gap-2 rounded-full border border-dashed border-stone-300 bg-transparent px-3 py-2.5 active:opacity-70 dark:border-stone-700"
  >
    <View className="h-6 w-6 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-900">
      <MaterialIcons name="add" size={16} color={iconColor} />
    </View>
    <Text className="text-sm font-medium text-stone-600 dark:text-stone-400">Add link</Text>
  </Pressable>
))
AddLinkButton.displayName = 'AddLinkButton'

const EmptyBookmarksState = memo(({
  listName,
  iconColor,
}: {
  listName: string
  iconColor: string
}) => (
  <View className="mb-8 items-center gap-4 rounded-[28px] border border-stone-200 bg-white/90 px-6 py-8 dark:border-stone-800 dark:bg-stone-900/60">
    <View className="h-14 w-14 items-center justify-center rounded-[20px] border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-950">
      <MaterialIcons name="bookmark-border" size={26} color={iconColor} />
    </View>
    <View className="items-center gap-2">
      <Text className="text-base font-semibold text-stone-900 dark:text-stone-100">No links in {listName} yet</Text>
      <Text className="max-w-[280px] text-center text-sm leading-6 text-stone-600 dark:text-stone-400">
        Add a link here or share a URL to Nori to save it for later.
      </Text>
    </View>
    <View className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <Text className="text-center text-xs font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
        Tip
      </Text>
      <Text className="mt-2 max-w-[260px] text-center text-sm leading-5 text-emerald-900 dark:text-emerald-50">
        Use your browser&apos;s share menu and pick Nori to file links into this app quickly.
      </Text>
    </View>
  </View>
))
EmptyBookmarksState.displayName = 'EmptyBookmarksState'

const EditModeHint = memo(({
  iconColor,
  canReorder = true,
}: {
  iconColor: string
  canReorder?: boolean
}) => (
  <View className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
    <View className="flex-row items-center gap-3">
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
        <MaterialIcons name="edit" size={16} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">Editing bookmarks</Text>
        <Text className="mt-0.5 text-[11px] leading-4 text-emerald-900 dark:text-emerald-50">
          {canReorder ? 'Drag to reorder. Tap a bookmark for quick actions.' : 'Tap a bookmark for quick actions.'}
        </Text>
      </View>
    </View>
  </View>
))
EditModeHint.displayName = 'EditModeHint'

const BookmarkListPage = memo(({
  list,
  width,
  listBookmarks,
  availableBookmarks,
  bookmarkEditMode,
  isActive,
  selectedBookmarkId,
  scrollViewRef,
  iconSubtleColor,
  iconAccentColor,
  onOpenBookmark,
  onOpenNewBookmark,
  onEditBookmark,
  onCopyBookmarkUrl,
  onShareBookmark,
  onDeleteBookmark,
  onSelectBookmark,
  onBottomStateChange,
}: {
  list: { id: string; name: string }
  width: number
  listBookmarks: BookmarkRecord[]
  availableBookmarks: BookmarkRecord[]
  bookmarkEditMode: boolean
  isActive: boolean
  selectedBookmarkId: string | null
  scrollViewRef: AnimatedRef<Animated.ScrollView>
  iconSubtleColor: string
  iconAccentColor: string
  onOpenBookmark: (bookmark: BookmarkRecord) => void
  onOpenNewBookmark: () => void
  onEditBookmark: (bookmark: BookmarkRecord) => void
  onCopyBookmarkUrl: (bookmark: BookmarkRecord) => void
  onShareBookmark: (bookmark: BookmarkRecord) => void
  onDeleteBookmark: (bookmark: BookmarkRecord) => void
  onSelectBookmark: (bookmark: BookmarkRecord) => void
  onBottomStateChange: (atBottom: boolean) => void
}) => {
  const gridWidth = width - PAGE_HORIZONTAL_PADDING * 2
  const itemWidth = (gridWidth - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS
  const scrollViewportHeightRef = useRef(0)
  const scrollContentHeightRef = useRef(0)
  const scrollOffsetYRef = useRef(0)
  const lastBottomStateRef = useRef<boolean | null>(null)

  const reportBottomState = useCallback((atBottom: boolean) => {
    if (lastBottomStateRef.current === atBottom) {
      return
    }
    lastBottomStateRef.current = atBottom
    if (isActive) {
      onBottomStateChange(atBottom)
    }
  }, [isActive, onBottomStateChange])

  const updateBottomState = useCallback((offsetY: number) => {
    scrollOffsetYRef.current = offsetY
    const viewportHeight = scrollViewportHeightRef.current
    const contentHeight = scrollContentHeightRef.current
    if (viewportHeight <= 0 || contentHeight <= 0) {
      return
    }
    reportBottomState(offsetY + viewportHeight >= contentHeight - BOTTOM_EDGE_THRESHOLD)
  }, [reportBottomState])

  const onVerticalLayout = useCallback((event: LayoutChangeEvent) => {
    scrollViewportHeightRef.current = event.nativeEvent.layout.height
    updateBottomState(0)
  }, [updateBottomState])

  const onVerticalContentSizeChange = useCallback((_width: number, height: number) => {
    scrollContentHeightRef.current = height
    updateBottomState(0)
  }, [updateBottomState])

  const onVerticalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    scrollViewportHeightRef.current = layoutMeasurement.height
    scrollContentHeightRef.current = contentSize.height
    updateBottomState(contentOffset.y)
  }, [updateBottomState])

  useEffect(() => {
    lastBottomStateRef.current = null
    updateBottomState(scrollOffsetYRef.current)
  }, [isActive, updateBottomState])

  const renderFlatListItem = useCallback(({ item: bookmark }: { item: BookmarkRecord }) => (
    <View style={{ width: itemWidth }}>
      <BookmarkTile
        bookmark={bookmark}
        editMode={false}
        selected={selectedBookmarkId === bookmark.id}
        onSelect={() => onSelectBookmark(bookmark)}
        onOpen={() => onOpenBookmark(bookmark)}
        onEdit={() => onEditBookmark(bookmark)}
        onCopyUrl={() => onCopyBookmarkUrl(bookmark)}
        onShare={() => onShareBookmark(bookmark)}
        onDelete={() => onDeleteBookmark(bookmark)}
      />
    </View>
  ), [
    itemWidth,
    onCopyBookmarkUrl,
    onDeleteBookmark,
    onEditBookmark,
    onOpenBookmark,
    onSelectBookmark,
    onShareBookmark,
    selectedBookmarkId,
  ])

  const renderEditFlatListItem = useCallback(({ item: bookmark }: { item: BookmarkRecord }) => (
    <View style={{ width: itemWidth }}>
      <BookmarkTile
        bookmark={bookmark}
        editMode={true}
        selected={selectedBookmarkId === bookmark.id}
        onSelect={() => onSelectBookmark(bookmark)}
        onOpen={() => onSelectBookmark(bookmark)}
        onEdit={() => onEditBookmark(bookmark)}
        onCopyUrl={() => onCopyBookmarkUrl(bookmark)}
        onShare={() => onShareBookmark(bookmark)}
        onDelete={() => onDeleteBookmark(bookmark)}
      />
    </View>
  ), [
    itemWidth,
    onCopyBookmarkUrl,
    onDeleteBookmark,
    onEditBookmark,
    onSelectBookmark,
    onShareBookmark,
    selectedBookmarkId,
  ])

  const getItemLayout = useCallback((_: ArrayLike<BookmarkRecord> | null | undefined, index: number) => {
    const rowHeight = TILE_HEIGHT + GRID_GAP
    const rowIndex = Math.floor(index / GRID_COLUMNS)
    return {
      length: rowHeight,
      offset: rowIndex * rowHeight,
      index,
    }
  }, [])

  if (!bookmarkEditMode) {
    return (
      <View className="flex-1" style={{ width }}>
        <FlatList
          data={listBookmarks}
          renderItem={renderFlatListItem}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: PAGE_HORIZONTAL_PADDING,
            paddingVertical: 16,
          }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          ListHeaderComponent={listBookmarks.length === 0 ? (
            <EmptyBookmarksState listName={list.name} iconColor={iconSubtleColor} />
          ) : null}
          ListFooterComponent={(
            <View className="mb-4" style={{ width: itemWidth }}>
              <AddLinkButton onPress={onOpenNewBookmark} iconColor={iconSubtleColor} />
            </View>
          )}
          getItemLayout={getItemLayout}
          onLayout={onVerticalLayout}
          onContentSizeChange={onVerticalContentSizeChange}
          onScroll={onVerticalScroll}
          initialNumToRender={INITIAL_BOOKMARKS_TO_RENDER}
          maxToRenderPerBatch={BOOKMARKS_RENDER_BATCH}
          windowSize={3}
          removeClippedSubviews
        />
      </View>
    )
  }

  if (listBookmarks.length > LARGE_EDIT_LIST_THRESHOLD) {
    return (
      <View className="flex-1" style={{ width }}>
        <FlatList
          data={listBookmarks}
          renderItem={renderEditFlatListItem}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: PAGE_HORIZONTAL_PADDING,
            paddingVertical: 16,
          }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          ListHeaderComponent={<EditModeHint iconColor={iconAccentColor} canReorder={false} />}
          ListFooterComponent={availableBookmarks.length ? (
            <View className="gap-4 pt-4">
              <SectionLabel title="Hidden in this list" subtitle="Tap a bookmark to bring it back." />
              <SortableGrid
                items={availableBookmarks}
                itemHeight={TILE_HEIGHT}
                editMode={false}
                scrollViewRef={scrollViewRef}
                renderItem={(bookmark) => (
                  <BookmarkTile
                    key={bookmark.id}
                    bookmark={bookmark}
                    editMode={true}
                    onSelect={() => bookmarks$.setVisible(bookmark.id, true)}
                    onOpen={() => {}}
                  />
                )}
                onReorder={() => {}}
              />
            </View>
          ) : null}
          onLayout={onVerticalLayout}
          onContentSizeChange={onVerticalContentSizeChange}
          onScroll={onVerticalScroll}
          initialNumToRender={INITIAL_BOOKMARKS_TO_RENDER}
          maxToRenderPerBatch={BOOKMARKS_RENDER_BATCH}
          windowSize={5}
          removeClippedSubviews
        />
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ width }}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        onLayout={onVerticalLayout}
        onContentSizeChange={onVerticalContentSizeChange}
        onScroll={onVerticalScroll}
        scrollEventThrottle={16}
        contentContainerClassName="grow justify-center px-6 py-4"
        className="flex-1"
      >
        <View className="gap-8">
          <EditModeHint iconColor={iconAccentColor} />

          <SortableGrid
            items={listBookmarks}
            itemHeight={TILE_HEIGHT}
            editMode={true}
            scrollViewRef={scrollViewRef}
            onReorder={(newOrder) => bookmarks$.reorder(list.id, newOrder)}
            renderItem={(bookmark, isDragging) => (
              <BookmarkTile
                bookmark={bookmark}
                editMode={true}
                selected={selectedBookmarkId === bookmark.id}
                onSelect={() => onSelectBookmark(bookmark)}
                onOpen={() => onSelectBookmark(bookmark)}
                onEdit={() => onEditBookmark(bookmark)}
                onCopyUrl={() => onCopyBookmarkUrl(bookmark)}
                onShare={() => onShareBookmark(bookmark)}
                onDelete={() => onDeleteBookmark(bookmark)}
                isDragging={isDragging}
              />
            )}
          />

          {availableBookmarks.length ? (
            <View className="gap-4">
              <SectionLabel title="Hidden in this list" subtitle="Tap a bookmark to bring it back." />
              <SortableGrid
                items={availableBookmarks}
                itemHeight={TILE_HEIGHT}
                editMode={false}
                scrollViewRef={scrollViewRef}
                renderItem={(bookmark) => (
                  <BookmarkTile
                    key={bookmark.id}
                    bookmark={bookmark}
                    editMode={true}
                    onSelect={() => bookmarks$.setVisible(bookmark.id, true)}
                    onOpen={() => {}}
                  />
                )}
                onReorder={() => {}}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
})
BookmarkListPage.displayName = 'BookmarkListPage'

export const BookmarkPager: React.FC = () => {
  const themeColors = useThemeColors()
  const lists = useValue(lists$.lists)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const selectedListId = useValue(settings$.lastSelectedListId)
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const selectedBookmarkId = useValue(ui$.selectedBookmarkId)
  const pagerRef = useAnimatedRef<Animated.ScrollView>()
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  const chipScrollViewRef = useRef<ScrollView>(null)
  const pagerScrollX = useSharedValue(0)
  const pagerIndexRef = useRef(-1)
  const suppressScrollSyncRef = useRef(false)
  const animateNextPagerScrollRef = useRef(true)
  const pendingListSelectionRef = useRef<string | null>(null)
  const chipLayoutsRef = useRef(new Map<string, { x: number; width: number }>())
  const chipViewportWidthRef = useRef(0)
  const chipScrollXRef = useRef(0)
  const didInitialChipScrollRef = useRef(false)
  const initialSelectedListIdRef = useRef<string | null>(null)
  const skipNextChipVisibilityScrollRef = useRef(false)
  const [renderNearbyPages, setRenderNearbyPages] = useState(false)
  const [immediatePagerIndex, setImmediatePagerIndex] = useState<number | null>(null)
  const { width: windowWidth } = useWindowDimensions()
  const visibleLists = useMemo(() => getVisibleLists(lists), [lists])
  const bookmarksByList = useMemo(() => groupBookmarksByList(bookmarks), [bookmarks])
  const selectedList = useMemo(
    () => visibleLists.find((item) => item.id === selectedListId) || visibleLists[0] || null,
    [selectedListId, visibleLists],
  )
  if (!initialSelectedListIdRef.current && selectedList?.id) {
    initialSelectedListIdRef.current = selectedList.id
  }
  const selectedListIndex = useMemo(
    () => visibleLists.findIndex((item) => item.id === selectedList?.id),
    [selectedList?.id, visibleLists],
  )
  const selectedBookmark = useMemo(
    () => {
      if (!selectedBookmarkId) return null
      return bookmarks.find((bookmark) => bookmark.id === selectedBookmarkId) || null
    },
    [selectedBookmarkId, bookmarks],
  )

  const selectBookmark = useCallback((bookmark: BookmarkRecord) => {
    ui$.selectedBookmarkId.set(ui$.selectedBookmarkId.get() === bookmark.id ? null : bookmark.id)
  }, [])

  const handleOpenBookmark = useCallback((bookmark: BookmarkRecord) => {
    void openBookmarkAction(bookmark)
  }, [])

  const openNewBookmark = useCallback(() => {
    if (!selectedList) {
      showToast('Enable or create a list first')
      return
    }
    ui$.bookmarkEditor.set({
      url: '',
      title: '',
      icon: '',
      listId: selectedList.id,
    })
  }, [selectedList])

  const editBookmark = useCallback((bookmark: BookmarkRecord) => {
    ui$.bookmarkEditor.set({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      icon: bookmark.icon || '',
      listId: bookmark.listId || selectedList?.id || '',
    })
  }, [selectedList?.id])

  const copyBookmarkUrl = useCallback((bookmark: BookmarkRecord) => {
    void Clipboard.setStringAsync(bookmark.url)
    showToast('URL copied')
  }, [])

  const shareBookmark = useCallback((bookmark: BookmarkRecord) => {
    void Share.share({ url: bookmark.url, message: bookmark.url })
  }, [])

  const setBookmarkListAtBottom = useCallback((atBottom: boolean) => {
    if (ui$.bookmarkListAtBottom.peek() !== atBottom) {
      ui$.bookmarkListAtBottom.set(atBottom)
    }
  }, [])

  const scrollSelectedChipIntoView = useCallback((listId: string | undefined, animated = true, onlyIfNeeded = true) => {
    if (!listId) {
      return false
    }

    const layout = chipLayoutsRef.current.get(listId)
    const viewportWidth = chipViewportWidthRef.current
    if (!layout || viewportWidth <= 0) {
      return false
    }

    const currentX = chipScrollXRef.current
    const left = layout.x
    const right = layout.x + layout.width
    const viewportLeft = currentX
    const viewportRight = currentX + viewportWidth

    if (onlyIfNeeded && left >= viewportLeft && right <= viewportRight) {
      return true
    }

    const padding = 12
    const x = left < viewportLeft
      ? Math.max(0, left - padding)
      : Math.max(0, right - viewportWidth + padding)
    chipScrollViewRef.current?.scrollTo({ x, animated })
    return true
  }, [])

  const onChipRowLayout = useCallback((event: LayoutChangeEvent) => {
    chipViewportWidthRef.current = event.nativeEvent.layout.width
    if (!didInitialChipScrollRef.current) {
      didInitialChipScrollRef.current = scrollSelectedChipIntoView(initialSelectedListIdRef.current ?? undefined, false, false)
    }
  }, [scrollSelectedChipIntoView])

  const onChipLayout = useCallback((listId: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout
    chipLayoutsRef.current.set(listId, { x, width })
    if (!didInitialChipScrollRef.current && listId === initialSelectedListIdRef.current) {
      didInitialChipScrollRef.current = scrollSelectedChipIntoView(listId, false, false)
    }
  }, [scrollSelectedChipIntoView])

  const selectListFromChip = useCallback((listId: string, index: number) => {
    pendingListSelectionRef.current = null
    skipNextChipVisibilityScrollRef.current = true
    setImmediatePagerIndex(index)
    pagerIndexRef.current = index
    suppressScrollSyncRef.current = false
    animateNextPagerScrollRef.current = false
    pagerRef.current?.scrollTo({ x: index * windowWidth, animated: false })
    settings$.setLastSelectedListId(listId)
  }, [pagerRef, windowWidth])

  useEffect(() => {
    if (selectedListIndex !== -1) {
      if (pagerIndexRef.current === -1) {
        pagerIndexRef.current = selectedListIndex
        pagerRef.current?.scrollTo({ x: selectedListIndex * windowWidth, animated: false })
        return
      }

      if (pagerIndexRef.current !== selectedListIndex) {
        const animated = animateNextPagerScrollRef.current
        animateNextPagerScrollRef.current = true
        suppressScrollSyncRef.current = animated
        pagerIndexRef.current = selectedListIndex
        pagerRef.current?.scrollTo({ x: selectedListIndex * windowWidth, animated })
      }
    }
  }, [pagerRef, selectedListIndex, windowWidth])

  useEffect(() => {
    if (!bookmarkEditMode) {
      ui$.selectedBookmarkId.set(null)
    }
  }, [bookmarkEditMode])

  useEffect(() => {
    ui$.selectedBookmarkId.set(null)
  }, [selectedList?.id])

  useEffect(() => {
    if (!selectedList?.id || !didInitialChipScrollRef.current) {
      return
    }

    if (skipNextChipVisibilityScrollRef.current) {
      skipNextChipVisibilityScrollRef.current = false
      return
    }

    scrollSelectedChipIntoView(selectedList.id, true)
  }, [scrollSelectedChipIntoView, selectedList?.id])

  useEffect(() => {
    if (immediatePagerIndex != null && immediatePagerIndex === selectedListIndex) {
      setImmediatePagerIndex(null)
    }
  }, [immediatePagerIndex, selectedListIndex])

  useEffect(() => {
    setRenderNearbyPages(false)
    const interaction = InteractionManager.runAfterInteractions(() => {
      setRenderNearbyPages(true)
    })

    return () => {
      interaction.cancel()
    }
  }, [selectedListIndex])

  const onPagerScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet'
      pagerScrollX.value = event.contentOffset.x
    },
  })

  const syncPagerSelection = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (suppressScrollSyncRef.current) {
      return
    }
    const index = Math.round(e.nativeEvent.contentOffset.x / windowWidth)
    if (index === pagerIndexRef.current) {
      return
    }
    pagerIndexRef.current = index
    const nextList = visibleLists[index]
    if (nextList && nextList.id !== selectedListId) {
      settings$.setLastSelectedListId(nextList.id)
    }
  }

  const removeSelectedBookmark = () => {
    if (!selectedBookmark) {
      return
    }

    Alert.alert('Delete bookmark?', `Remove ${selectedBookmark.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          bookmarks$.remove(selectedBookmark.id)
          showToast('Bookmark deleted')
          ui$.selectedBookmarkId.set(null)
        },
      },
    ])
  }

  const promptDeleteBookmark = useCallback((bookmark: { id: string; title: string }) => {
    Alert.alert('Delete bookmark?', `Remove ${bookmark.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          bookmarks$.remove(bookmark.id)
          showToast('Bookmark deleted')
          if (selectedBookmarkId === bookmark.id) {
            ui$.selectedBookmarkId.set(null)
          }
        },
      },
    ])
  }, [selectedBookmarkId])

  return (
    <View className="flex-1">
      <View className="mb-8 mt-4 px-6">
        <ScrollView
          ref={chipScrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 pr-6"
          onLayout={onChipRowLayout}
          onScroll={(event) => {
            chipScrollXRef.current = event.nativeEvent.contentOffset.x
          }}
          scrollEventThrottle={16}
        >
          {visibleLists.map((list, index) => (
            <View key={list.id} onLayout={(event) => onChipLayout(list.id, event)}>
              <ListChip
                name={list.name}
                index={index}
                pagerScrollX={pagerScrollX}
                pageWidth={windowWidth}
                onPress={() => selectListFromChip(list.id, index)}
              />
            </View>
          ))}
          {!bookmarkEditMode ? (
            <Pressable
              onPress={() => ui$.listEditor.set({ name: '' })}
              className="h-[32px] flex-row items-center gap-1.5 rounded-full border border-dashed border-stone-300 bg-transparent px-4 dark:border-stone-700"
            >
              <MaterialIcons name="add" size={16} color={themeColors.iconSubtle} />
              <Text className="text-sm font-medium text-stone-600 dark:text-stone-300">New list</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        onMomentumScrollEnd={(e) => {
          const pendingListId = pendingListSelectionRef.current
          if (pendingListId) {
            pendingListSelectionRef.current = null
            suppressScrollSyncRef.current = false
            settings$.setLastSelectedListId(pendingListId)
            return
          }
          suppressScrollSyncRef.current = false
          syncPagerSelection(e)
        }}
        scrollEventThrottle={16}
        scrollEnabled={!bookmarkEditMode}
        className="flex-1"
      >
        {visibleLists.map((list, index) => {
          const group = bookmarksByList.get(list.id)
          const listBookmarks = group?.visible || []
          const availableBookmarks = group?.available || []
          const currentPagerIndex = pagerIndexRef.current === -1 ? selectedListIndex : pagerIndexRef.current
          const isCurrentPage = index === currentPagerIndex || (currentPagerIndex === -1 && index === selectedListIndex)
          const shouldRenderPage = selectedListIndex === -1
            || index === selectedListIndex
            || index === immediatePagerIndex
            || (!bookmarkEditMode && currentPagerIndex !== -1 && index === currentPagerIndex)
            || (!bookmarkEditMode && renderNearbyPages && Math.abs(index - selectedListIndex) <= PAGE_RENDER_RADIUS)

          return (
            <View key={list.id} className="flex-1" style={{ width: windowWidth }}>
              {shouldRenderPage ? (
                <BookmarkListPage
                  list={list}
                  width={windowWidth}
                  listBookmarks={listBookmarks}
                  availableBookmarks={availableBookmarks}
                  bookmarkEditMode={bookmarkEditMode}
                  isActive={isCurrentPage}
                  selectedBookmarkId={selectedBookmarkId}
                  scrollViewRef={scrollViewRef}
                  iconSubtleColor={themeColors.iconSubtle}
                  iconAccentColor={themeColors.iconAccent}
                  onOpenBookmark={handleOpenBookmark}
                  onOpenNewBookmark={openNewBookmark}
                  onEditBookmark={editBookmark}
                  onCopyBookmarkUrl={copyBookmarkUrl}
                  onShareBookmark={shareBookmark}
                  onDeleteBookmark={promptDeleteBookmark}
                  onSelectBookmark={selectBookmark}
                  onBottomStateChange={setBookmarkListAtBottom}
                />
              ) : null}
            </View>
          )
        })}
      </Animated.ScrollView>

      <View className="absolute bottom-4 right-6 left-6 z-10">
        <View
          className="flex-row items-center justify-between rounded-full border border-white/70 bg-white/70 px-3 py-2 shadow-lg dark:border-white/10 dark:bg-stone-950/70"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 16,
          }}
        >
          {bookmarkEditMode ? (
            selectedBookmark ? (
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => {
                    bookmarks$.setVisible(selectedBookmark.id, false)
                    ui$.selectedBookmarkId.set(null)
                  }}
                  className="h-10 items-center justify-center rounded-full bg-stone-200 px-4 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
                >
                  <Text className="text-sm font-medium text-stone-900 dark:text-stone-200">Hide</Text>
                </Pressable>
                <Pressable
                  onPress={removeSelectedBookmark}
                  className="h-10 w-10 items-center justify-center rounded-full bg-rose-100 active:bg-rose-200 dark:bg-rose-900/40 dark:active:bg-rose-900/60"
                >
                  <MaterialIcons name="delete" size={18} color={themeColors.iconDanger} />
                </Pressable>
              </View>
            ) : (
              <View className="h-10 w-10" />
            )
          ) : (
            <Pressable
              onPress={openNewBookmark}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15"
            >
              <MaterialIcons name="add" size={20} color={themeColors.iconMuted} />
            </Pressable>
          )}
          {!bookmarkEditMode ? (
            <Pressable onPress={() => ui$.drawerOpen.set(true)} className="h-10 items-center justify-center px-4">
              <View className="h-1 w-12 rounded-full bg-stone-300/90 dark:bg-white/20" />
              <MaterialIcons name="keyboard-arrow-up" size={24} color={themeColors.iconMuted} />
            </Pressable>
          ) : (
            <View className="h-10 w-20" />
          )}
          <Pressable
            onPress={() => {
              if (bookmarkEditMode) {
                ui$.bookmarkEditMode.set(false)
                ui$.selectedBookmarkId.set(null)
              } else {
                ui$.bookmarkEditMode.set(true)
              }
            }}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              bookmarkEditMode
                ? 'bg-emerald-600 active:bg-emerald-700'
                : 'bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15'
            }`}
          >
            <MaterialIcons
              name={bookmarkEditMode ? 'check' : 'edit'}
              size={18}
              color={bookmarkEditMode ? '#ffffff' : themeColors.iconMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  )
}
