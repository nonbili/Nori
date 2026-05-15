import { memo, useCallback, useMemo, type RefObject } from 'react'
import { Pressable, ScrollView as NativeScrollView, Text, TextInput, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { FlashList } from '@shopify/flash-list'
import { GestureDetector, ScrollView } from 'react-native-gesture-handler'
import { useValue } from '@legendapp/state/react'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'
import { ManageRow } from '@/components/common/Common'
import { BookmarkActionsMenu } from '@/components/bookmark/BookmarkActionsMenu'
import { Favicon } from '@/components/bookmark/Favicon'
import { ListChip } from '@/components/list/ListChip'
import { type ThemeColors } from '@/lib/theme'
import { getLiveBookmarks, getVisibleLists } from '@/lib/nori-data'

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

type SortType = 'newest' | 'oldest' | 'az' | 'za'

export interface DrawerPartsState {
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortType: SortType
  setSortType: (value: SortType) => void
  filterListId: string
  setFilterListId: (value: string) => void
  themeColors: ThemeColors
  closeDrawerWithAnimation: () => void
  closeDrawerGesture: any
  closeDrawerPanGesture: any
  scrollRef: RefObject<any>
  onScroll: (event: any) => void
  onOpen: (bookmark: BookmarkRecord) => void
  onEdit: (bookmark: BookmarkRecord) => void
  onCopyUrl: (bookmark: BookmarkRecord) => void
  onShare: (bookmark: BookmarkRecord) => void
  onDelete: (bookmark: BookmarkRecord) => void
}

const BookmarkItem = memo(({ bookmark, drawer }: { bookmark: BookmarkRecord; drawer: DrawerPartsState }) => (
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
    onPress={() => drawer.onOpen(bookmark)}
    actions={
      <BookmarkActionsMenu
        onEdit={() => drawer.onEdit(bookmark)}
        onCopyUrl={() => drawer.onCopyUrl(bookmark)}
        onShare={() => drawer.onShare(bookmark)}
        onDelete={() => drawer.onDelete(bookmark)}
        trigger={
          <View className="h-8 w-8 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
            <MaterialIcons name="more-vert" size={18} color={drawer.themeColors.iconMuted} />
          </View>
        }
      />
    }
  />
))
BookmarkItem.displayName = 'BookmarkItem'

const ListSeparator = memo(() => <View style={{ height: 12 }} />)
ListSeparator.displayName = 'ListSeparator'

export const DrawerHeader: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const sortLabel = { newest: 'Newest', oldest: 'Oldest', az: 'A-Z', za: 'Z-A' }[drawer.sortType]
  const sortMenuItems: NouMenuItem[] = useMemo(() => [
    { label: 'Newest first', handler: () => drawer.setSortType('newest'), selected: drawer.sortType === 'newest' },
    { label: 'Oldest first', handler: () => drawer.setSortType('oldest'), selected: drawer.sortType === 'oldest' },
    { label: 'Name A-Z', handler: () => drawer.setSortType('az'), selected: drawer.sortType === 'az' },
    { label: 'Name Z-A', handler: () => drawer.setSortType('za'), selected: drawer.sortType === 'za' },
  ], [drawer])

  return (
    <View className="mb-6 flex-row items-center gap-3">
      <Pressable
        onPress={drawer.closeDrawerWithAnimation}
        className="h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
      >
        <MaterialIcons name="arrow-back" size={20} color={drawer.themeColors.iconMuted} />
      </Pressable>
      <View className="h-12 flex-1 flex-row items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 dark:border-stone-800 dark:bg-stone-900">
        <MaterialIcons name="search" size={20} color={drawer.themeColors.iconMuted} />
        <TextInput
          value={drawer.searchQuery}
          onChangeText={drawer.setSearchQuery}
          placeholder="Search..."
          placeholderTextColor={drawer.themeColors.placeholder}
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
            <MaterialIcons name="sort" size={18} color={drawer.themeColors.iconMuted} />
            <Text className="text-sm font-medium text-stone-700 dark:text-stone-300">{sortLabel}</Text>
            <MaterialIcons name="arrow-drop-down" size={18} color={drawer.themeColors.iconMuted} />
          </View>
        }
      />
    </View>
  )
}

export const DrawerFilterChips: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const lists = useValue(lists$.lists)
  const visibleLists = getVisibleLists(lists)

  return (
    <View className="mb-6">
      <GestureDetector gesture={drawer.closeDrawerGesture}>
        <NativeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          <ListChip name="All" isActive={drawer.filterListId === 'all'} onPress={() => drawer.setFilterListId('all')} />
          {visibleLists.map((list) => (
            <ListChip
              key={list.id}
              name={list.name}
              isActive={drawer.filterListId === list.id}
              onPress={() => drawer.setFilterListId(list.id)}
            />
          ))}
        </NativeScrollView>
      </GestureDetector>
    </View>
  )
}

export const DrawerBookmarkResults: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const bookmarks = useValue(bookmarks$.bookmarks)
  const filteredBookmarks = useMemo(() => {
    const query = drawer.searchQuery.trim().toLowerCase()
    const result = getLiveBookmarks(bookmarks).filter((bookmark) => {
      if (drawer.filterListId !== 'all' && bookmark.listId !== drawer.filterListId) return false
      if (!query) return true
      return bookmark.title.toLowerCase().includes(query) || bookmark.url.toLowerCase().includes(query)
    })

    result.sort((a, b) => {
      switch (drawer.sortType) {
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
  }, [bookmarks, drawer])

  const renderBookmarkRow = useCallback(({ item: bookmark }: { item: BookmarkRecord }) => (
    <BookmarkItem bookmark={bookmark} drawer={drawer} />
  ), [drawer])
  const renderScrollComponent = useCallback((props: any) => (
    <ScrollView {...props} ref={drawer.scrollRef} />
  ), [drawer.scrollRef])

  return (
    <GestureDetector gesture={drawer.closeDrawerPanGesture}>
      {filteredBookmarks.length > 0 ? (
        <View className="flex-1">
          <FlashList
            data={filteredBookmarks}
            renderItem={renderBookmarkRow}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 48 }}
            ItemSeparatorComponent={ListSeparator}
            showsVerticalScrollIndicator={false}
            onScroll={drawer.onScroll}
            scrollEventThrottle={16}
            renderScrollComponent={renderScrollComponent}
          />
        </View>
      ) : (
        <View className="flex-1 items-center py-20">
          <MaterialIcons name="search-off" size={48} color={drawer.themeColors.iconSubtle} />
          <Text className="mt-4 text-base font-medium text-stone-500">No bookmarks found</Text>
          <Text className="mt-1 text-sm text-stone-600 dark:text-stone-500">Try a different filter or search</Text>
        </View>
      )}
    </GestureDetector>
  )
}
