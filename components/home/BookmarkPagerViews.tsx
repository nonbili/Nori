import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated from 'react-native-reanimated'
import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { ListChip } from '@/components/list/ListChip'
import { NouMenu } from '@/components/menu/NouMenu'
import { BookmarkListPage, type BookmarkPagerActions } from '@/components/home/BookmarkPagerParts'
import { SCREEN_TOP_OFFSET } from '@/lib/layout'
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

export const BookmarkListChips: React.FC<{ pager: BookmarkPagerViewModel }> = ({ pager }) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  // The chips row is the topmost element now that every action lives in the
  // bottom toolbar, so it clears the status bar itself.
  return (
  <View className="mb-8 px-6" style={{ paddingTop: insets.top + SCREEN_TOP_OFFSET }}>
    <View className="flex-row items-center gap-2">
    <ScrollView
      ref={pager.chipScrollViewRef}
      horizontal
      className="min-w-0 flex-1"
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-3 pr-2"
      onLayout={pager.onChipRowLayout}
      onScroll={(event) => pager.onChipScroll(event.nativeEvent.contentOffset.x)}
      scrollEventThrottle={16}
    >
      {pager.lists.map((list, index) => (
        <View key={list.id} onLayout={(event) => pager.onChipLayout(list.id, event)}>
          <ListChip
            name={list.name}
            isActive={list.id === pager.selectedListId}
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
          className="h-[36px] flex-row items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-transparent px-4"
        >
          <MaterialIcons name="add" size={16} color={pager.themeColors.contentSubtle} />
          <NoriText className="text-sm font-medium text-content-secondary">
            {t('lists.new')}
          </NoriText>
        </Pressable>
      ) : null}
    </ScrollView>
    {!pager.bookmarkEditMode ? (
      <NouMenu
        accessibilityLabel={t('lists.manage')}
        items={[
          ...pager.lists.map((list, index) => ({
            id: list.id,
            label: list.name,
            selected: list.id === pager.selectedListId,
            handler: () => pager.onSelectList(list.id, index),
          })),
          {
            id: 'new-list',
            label: t('lists.new'),
            icon: 'add' as const,
            footer: true,
            handler: () => ui$.listEditor.set({ name: '' }),
          },
        ]}
        triggerClassName="h-[36px] w-[36px] items-center justify-center rounded-full border border-line-strong bg-muted active:bg-muted-strong"
        trigger={<MaterialIcons name="list" size={18} color={pager.themeColors.content} />}
      />
    ) : null}
    </View>
  </View>
  )
}

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
