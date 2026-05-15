import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import Animated from 'react-native-reanimated'
import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { ListChip } from '@/components/list/ListChip'
import { BookmarkListPage, type BookmarkPagerActions } from '@/components/home/BookmarkPagerParts'
import type { BookmarkRecord } from '@/states/bookmarks'
import type { ThemeColors } from '@/lib/theme'

export interface BookmarkPagerViewModel {
  lists: Array<{ id: string; name: string }>
  bookmarkEditMode: boolean
  chipScrollViewRef: React.RefObject<ScrollView | null>
  pagerScrollX: any
  pageWidth: number
  themeColors: ThemeColors
  onChipRowLayout: (event: LayoutChangeEvent) => void
  onChipLayout: (listId: string, event: LayoutChangeEvent) => void
  onSelectList: (listId: string, index: number) => void
  onChipScroll: (x: number) => void
  bookmarksByList: Map<string, { visible: BookmarkRecord[]; available: BookmarkRecord[] }>
  selectedListId: string
  selectedListIndex: number
  immediatePagerIndex: number | null
  renderNearbyPages: boolean
  pagerRef: any
  onPagerScroll: any
  currentPagerIndex: number
  onMomentumSettled: (event: any) => void
}

export const BookmarkListChips: React.FC<{ pager: BookmarkPagerViewModel }> = ({ pager }) => (
  <View className="mb-8 mt-4 px-6">
    <ScrollView
      ref={pager.chipScrollViewRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 pr-6"
      onLayout={pager.onChipRowLayout}
      onScroll={(event) => pager.onChipScroll(event.nativeEvent.contentOffset.x)}
      scrollEventThrottle={16}
    >
      {pager.lists.map((list, index) => (
        <View key={list.id} onLayout={(event) => pager.onChipLayout(list.id, event)}>
          <ListChip
            name={list.name}
            index={index}
            pagerScrollX={pager.pagerScrollX}
            pageWidth={pager.pageWidth}
            onPress={() => pager.onSelectList(list.id, index)}
          />
        </View>
      ))}
      {!pager.bookmarkEditMode ? (
        <Pressable
          onPress={() => ui$.listEditor.set({ name: '' })}
          className="h-[32px] flex-row items-center gap-1.5 rounded-full border border-dashed border-stone-300 bg-transparent px-4 dark:border-stone-700"
        >
          <MaterialIcons name="add" size={16} color={pager.themeColors.iconSubtle} />
          <Text className="text-sm font-medium text-stone-600 dark:text-stone-300">New list</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  </View>
)

export const BookmarkPagerPages: React.FC<{
  pager: BookmarkPagerViewModel
  actions: BookmarkPagerActions
}> = ({ pager, actions }) => (
  <Animated.ScrollView
    ref={pager.pagerRef}
    horizontal
    pagingEnabled
    showsHorizontalScrollIndicator={false}
    onScroll={pager.onPagerScroll}
    onMomentumScrollEnd={(event) => {
      pager.onMomentumSettled(event)
    }}
    scrollEventThrottle={16}
    scrollEnabled={!pager.bookmarkEditMode}
    className="flex-1"
  >
    {pager.lists.map((list, index) => {
      const group = pager.bookmarksByList.get(list.id)
      const isCurrentPage = index === pager.currentPagerIndex || (pager.currentPagerIndex === -1 && index === pager.selectedListIndex)
      const shouldRenderPage = pager.selectedListIndex === -1
        || index === pager.selectedListIndex
        || index === pager.immediatePagerIndex
        || (!pager.bookmarkEditMode && pager.currentPagerIndex !== -1 && index === pager.currentPagerIndex)
        || (!pager.bookmarkEditMode && pager.renderNearbyPages && Math.abs(index - pager.selectedListIndex) <= 1)

      return (
        <View key={list.id} className="flex-1" style={{ width: pager.pageWidth }}>
          {shouldRenderPage ? (
            <BookmarkListPage
              list={list}
              width={pager.pageWidth}
              listBookmarks={group?.visible || []}
              availableBookmarks={group?.available || []}
              isActive={isCurrentPage}
              actions={actions}
            />
          ) : null}
        </View>
      )
    })}
  </Animated.ScrollView>
)
