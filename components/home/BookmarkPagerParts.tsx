import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { type AnimatedRef } from 'react-native-reanimated'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { ui$ } from '@/states/ui'
import { BookmarkTile } from '@/components/bookmark/BookmarkItem'
import { SortableGrid } from '@/components/bookmark/SortableGrid'
import { SectionLabel } from '@/components/common/Common'
import type { ThemeColors } from '@/lib/theme'

const TILE_HEIGHT = 46
const GRID_COLUMNS = 2
const GRID_GAP = 16
const PAGE_HORIZONTAL_PADDING = 24
const PAGE_BOTTOM_PADDING = 96
const INITIAL_BOOKMARKS_TO_RENDER = 6
const BOOKMARKS_RENDER_BATCH = 4
const BOTTOM_EDGE_THRESHOLD = 24
const BOTTOM_OVERSCROLL_OPEN_THRESHOLD = 12
const LARGE_EDIT_LIST_THRESHOLD = 120

export interface BookmarkPagerActions {
  iconSubtleColor: string
  iconAccentColor: string
  themeColors: ThemeColors
  scrollViewRef: AnimatedRef<Animated.ScrollView>
  onOpenBookmark: (bookmark: BookmarkRecord) => void
  onOpenNewBookmark: () => void
  onEditBookmark: (bookmark: BookmarkRecord) => void
  onCopyBookmarkUrl: (bookmark: BookmarkRecord) => void
  onShareBookmark: (bookmark: BookmarkRecord) => void
  onDeleteBookmark: (bookmark: BookmarkRecord) => void
  onSelectBookmark: (bookmark: BookmarkRecord) => void
  onSelectAll: () => void
  onHideSelected: () => void
  onBottomStateChange: (atBottom: boolean) => void
  onRemoveSelectedBookmark: () => void
}

const EmptyBookmarksState = memo(({ listName, iconColor }: { listName: string; iconColor: string }) => {
  const { t } = useTranslation()
  return (
    <View className="mb-8 items-center gap-4 rounded-[28px] border border-stone-200 bg-white/90 px-6 py-8 dark:border-stone-800 dark:bg-stone-900/60">
      <View className="h-14 w-14 items-center justify-center rounded-[20px] border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-950">
        <MaterialIcons name="bookmark-border" size={26} color={iconColor} />
      </View>
      <View className="items-center gap-2">
        <Text className="text-base font-semibold text-stone-900 dark:text-stone-100">{t('bookmarks.emptyListTitle', { name: listName })}</Text>
        <Text className="max-w-[280px] text-center text-sm leading-6 text-stone-600 dark:text-stone-400">
          {t('bookmarks.emptyListHint')}
        </Text>
      </View>
      <View className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <Text className="text-center text-xs font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">{t('bookmarks.tip')}</Text>
        <Text className="mt-2 max-w-[260px] text-center text-sm leading-5 text-emerald-900 dark:text-emerald-50">
          {t('bookmarks.shareTip')}
        </Text>
      </View>
    </View>
  )
})
EmptyBookmarksState.displayName = 'EmptyBookmarksState'

const EditModeHint = memo(({ iconColor, canReorder = true }: { iconColor: string; canReorder?: boolean }) => {
  const { t } = useTranslation()
  return (
    <View className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <View className="flex-row items-center gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
          <MaterialIcons name="edit" size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">{t('bookmarks.editing')}</Text>
          <Text className="mt-0.5 text-[11px] leading-4 text-emerald-900 dark:text-emerald-50">
            {canReorder ? t('bookmarks.editHint') : t('bookmarks.editHintNoReorder')}
          </Text>
        </View>
      </View>
    </View>
  )
})
EditModeHint.displayName = 'EditModeHint'

export const BookmarkListPage = memo(({
  list,
  width,
  listBookmarks,
  availableBookmarks,
  isActive,
  actions,
}: {
  list: { id: string; name: string }
  width: number
  listBookmarks: BookmarkRecord[]
  availableBookmarks: BookmarkRecord[]
  isActive: boolean
  actions: BookmarkPagerActions
}) => {
  const { t } = useTranslation()
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const selectedBookmarkIds = useValue(ui$.selectedBookmarkIds)
  const selectedIdSet = useMemo(() => new Set(selectedBookmarkIds), [selectedBookmarkIds])
  const insets = useSafeAreaInsets()
  const bottomPadding = PAGE_BOTTOM_PADDING + insets.bottom
  const itemWidth = (width - PAGE_HORIZONTAL_PADDING * 2 - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS
  const viewportHeightRef = useRef(0)
  const contentHeightRef = useRef(0)
  const offsetYRef = useRef(0)
  const lastBottomStateRef = useRef<boolean | null>(null)

  const updateBottomState = useCallback((offsetY: number) => {
    offsetYRef.current = offsetY
    if (viewportHeightRef.current <= 0 || contentHeightRef.current <= 0) return
    const atBottom = offsetY + viewportHeightRef.current >= contentHeightRef.current - BOTTOM_EDGE_THRESHOLD
    if (lastBottomStateRef.current !== atBottom) {
      lastBottomStateRef.current = atBottom
      if (isActive) actions.onBottomStateChange(atBottom)
    }
  }, [actions, isActive])

  useEffect(() => {
    lastBottomStateRef.current = null
    updateBottomState(offsetYRef.current)
  }, [isActive, updateBottomState])

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeightRef.current = event.nativeEvent.layout.height
    updateBottomState(0)
  }, [updateBottomState])

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height
    updateBottomState(0)
  }, [updateBottomState])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    viewportHeightRef.current = layoutMeasurement.height
    contentHeightRef.current = contentSize.height
    updateBottomState(contentOffset.y)
    const maxOffsetY = Math.max(0, contentSize.height - layoutMeasurement.height)
    if (
      isActive
      && !bookmarkEditMode
      && !ui$.drawerOpen.peek()
      && contentOffset.y > maxOffsetY + BOTTOM_OVERSCROLL_OPEN_THRESHOLD
    ) {
      ui$.openBookmarksDrawer()
    }
  }, [bookmarkEditMode, isActive, updateBottomState])

  const renderTile = useCallback(({ item: bookmark }: { item: BookmarkRecord }) => (
    <View style={{ width: itemWidth }}>
      <BookmarkTile
        bookmark={bookmark}
        editMode={bookmarkEditMode}
        selected={selectedIdSet.has(bookmark.id)}
        onSelect={() => actions.onSelectBookmark(bookmark)}
        onOpen={() => (bookmarkEditMode ? actions.onSelectBookmark(bookmark) : actions.onOpenBookmark(bookmark))}
        onEdit={() => actions.onEditBookmark(bookmark)}
        onCopyUrl={() => actions.onCopyBookmarkUrl(bookmark)}
        onShare={() => actions.onShareBookmark(bookmark)}
        onDelete={() => actions.onDeleteBookmark(bookmark)}
      />
    </View>
  ), [actions, bookmarkEditMode, itemWidth, selectedIdSet])

  const getItemLayout = useCallback((_: ArrayLike<BookmarkRecord> | null | undefined, index: number) => {
    const rowHeight = TILE_HEIGHT + GRID_GAP
    return { length: rowHeight, offset: Math.floor(index / GRID_COLUMNS) * rowHeight, index }
  }, [])

  if (!bookmarkEditMode || listBookmarks.length > LARGE_EDIT_LIST_THRESHOLD) {
    return (
      <View className="flex-1" style={{ width }}>
        <FlatList
          data={listBookmarks}
          renderItem={renderTile}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: PAGE_HORIZONTAL_PADDING,
            paddingTop: 16,
            paddingBottom: bottomPadding,
          }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          ListHeaderComponent={
            bookmarkEditMode
              ? <EditModeHint iconColor={actions.iconAccentColor} canReorder={false} />
              : listBookmarks.length === 0
                ? <EmptyBookmarksState listName={list.name} iconColor={actions.iconSubtleColor} />
                : null
          }
          ListFooterComponent={
            bookmarkEditMode && availableBookmarks.length ? (
              <View className="gap-4 pt-4">
                <SectionLabel title={t('bookmarks.hiddenInList')} subtitle={t('bookmarks.hiddenInListHint')} />
                <HiddenBookmarksGrid items={availableBookmarks} scrollViewRef={actions.scrollViewRef} />
              </View>
            ) : null
          }
          getItemLayout={getItemLayout}
          onLayout={onLayout}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
          initialNumToRender={INITIAL_BOOKMARKS_TO_RENDER}
          maxToRenderPerBatch={BOOKMARKS_RENDER_BATCH}
          windowSize={bookmarkEditMode ? 5 : 3}
          removeClippedSubviews
        />
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ width }}>
      <ScrollView
        ref={actions.scrollViewRef}
        showsVerticalScrollIndicator={false}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: PAGE_HORIZONTAL_PADDING, paddingTop: 16, paddingBottom: bottomPadding }}
        className="flex-1"
      >
        <View className="gap-8">
          <EditModeHint iconColor={actions.iconAccentColor} />
          <SortableGrid
            items={listBookmarks}
            itemHeight={TILE_HEIGHT}
            editMode={true}
            scrollViewRef={actions.scrollViewRef}
            onReorder={(newOrder) => bookmarks$.reorder(list.id, newOrder)}
            renderItem={(bookmark, isDragging) => (
              <BookmarkTile
                bookmark={bookmark}
                editMode={true}
                selected={selectedIdSet.has(bookmark.id)}
                onSelect={() => actions.onSelectBookmark(bookmark)}
                onOpen={() => actions.onSelectBookmark(bookmark)}
                onEdit={() => actions.onEditBookmark(bookmark)}
                onCopyUrl={() => actions.onCopyBookmarkUrl(bookmark)}
                onShare={() => actions.onShareBookmark(bookmark)}
                onDelete={() => actions.onDeleteBookmark(bookmark)}
                isDragging={isDragging}
              />
            )}
          />
          {availableBookmarks.length ? (
            <View className="gap-4">
              <SectionLabel title={t('bookmarks.hiddenInList')} subtitle={t('bookmarks.hiddenInListHint')} />
              <HiddenBookmarksGrid items={availableBookmarks} scrollViewRef={actions.scrollViewRef} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
})
BookmarkListPage.displayName = 'BookmarkListPage'

const HiddenBookmarksGrid: React.FC<{ items: BookmarkRecord[]; scrollViewRef: AnimatedRef<Animated.ScrollView> }> = ({ items, scrollViewRef }) => (
  <SortableGrid
    items={items}
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
)
