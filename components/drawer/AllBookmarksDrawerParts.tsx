import { memo, useCallback, useEffect, useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView as NativeScrollView, TextInput, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { FlashList } from '@shopify/flash-list'
import { GestureDetector, ScrollView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useValue } from '@legendapp/state/react'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { type NouMenuItem, NouMenu } from '@/components/menu/NouMenu'
import { ManageRow } from '@/components/common/Common'
import { BookmarkActionsMenu } from '@/components/bookmark/BookmarkActionsMenu'
import { Favicon } from '@/components/bookmark/Favicon'
import { ListChip } from '@/components/list/ListChip'
import { type ThemeColors } from '@/lib/theme'
import { getAllTags, getLiveBookmarks, getTags, getVisibleLists } from '@/lib/nori-data'

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

interface SearchEntry {
  bookmark: BookmarkRecord
  listId: string
  titleLower: string
  urlLower: string
  tagsLower: string[]
  createdAtMs: number
}

export interface DrawerPartsState {
  searchQuery: string
  setSearchQuery: (value: string) => void
  sortType: SortType
  setSortType: (value: SortType) => void
  filterListId: string
  setFilterListId: (value: string) => void
  filterTags: string[]
  setFilterTags: (value: string[]) => void
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
  const { t } = useTranslation()
  const sortLabel = {
    newest: t('bookmarks.sorting.newest'),
    oldest: t('bookmarks.sorting.oldest'),
    az: t('bookmarks.sorting.az'),
    za: t('bookmarks.sorting.za'),
  }[drawer.sortType]
  const sortMenuItems: NouMenuItem[] = useMemo(() => [
    { label: t('bookmarks.sorting.newestFirst'), handler: () => drawer.setSortType('newest'), selected: drawer.sortType === 'newest' },
    { label: t('bookmarks.sorting.oldestFirst'), handler: () => drawer.setSortType('oldest'), selected: drawer.sortType === 'oldest' },
    { label: t('bookmarks.sorting.nameAz'), handler: () => drawer.setSortType('az'), selected: drawer.sortType === 'az' },
    { label: t('bookmarks.sorting.nameZa'), handler: () => drawer.setSortType('za'), selected: drawer.sortType === 'za' },
  ], [drawer, t])

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
          placeholder={t('bookmarks.searchPlaceholder')}
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
            <NoriText className="text-sm font-medium text-stone-700 dark:text-stone-300">{sortLabel}</NoriText>
            <MaterialIcons name="arrow-drop-down" size={18} color={drawer.themeColors.iconMuted} />
          </View>
        }
      />
    </View>
  )
}

export const DrawerFilterChips: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const { t } = useTranslation()
  const lists = useValue(lists$.lists)
  const visibleLists = getVisibleLists(lists)

  return (
    <View className="mb-6">
      <GestureDetector gesture={drawer.closeDrawerGesture}>
        <NativeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          <ListChip name={t('bookmarks.all')} isActive={drawer.filterListId === 'all'} onPress={() => drawer.setFilterListId('all')} />
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

export const DrawerTagChips: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const bookmarks = useValue(bookmarks$.bookmarks)
  // Only surface tags that exist within the current list filter — selecting a tag absent
  // from the filtered list would otherwise (AND logic) always yield an empty result.
  const tags = useMemo(() => {
    const live = getLiveBookmarks(bookmarks)
    const scoped = drawer.filterListId === 'all'
      ? live
      : live.filter((bookmark) => bookmark.listId === drawer.filterListId)
    return getAllTags(scoped)
  }, [bookmarks, drawer.filterListId])

  // Drop any active tag filters that are no longer available in the current scope.
  useEffect(() => {
    const available = new Set(tags.map((tag) => tag.toLowerCase()))
    const next = drawer.filterTags.filter((tag) => available.has(tag.toLowerCase()))
    if (next.length !== drawer.filterTags.length) {
      drawer.setFilterTags(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags])

  const toggleTag = useCallback((tag: string) => {
    drawer.setFilterTags(
      drawer.filterTags.includes(tag)
        ? drawer.filterTags.filter((item) => item !== tag)
        : [...drawer.filterTags, tag],
    )
  }, [drawer])

  if (tags.length === 0) {
    return null
  }

  return (
    <View className="mb-6">
      <GestureDetector gesture={drawer.closeDrawerGesture}>
        <NativeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {tags.map((tag) => {
            const isActive = drawer.filterTags.includes(tag)
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                className={`h-[32px] flex-row items-center gap-1 rounded-full border px-3.5 ${
                  isActive
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40'
                    : 'border-stone-200 dark:border-stone-800'
                }`}
              >
                <NoriText className={`text-xs font-bold ${isActive ? 'text-emerald-500 dark:text-emerald-500' : 'text-stone-400 dark:text-stone-500'}`}>#</NoriText>
                <NoriText className={`text-sm font-medium ${isActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}`}>{tag}</NoriText>
              </Pressable>
            )
          })}
        </NativeScrollView>
      </GestureDetector>
    </View>
  )
}

export const DrawerBookmarkResults: React.FC<{ drawer: DrawerPartsState }> = ({ drawer }) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const bookmarks = useValue(bookmarks$.bookmarks)
  // Lowercasing every title, url and tag per keystroke is the expensive half of
  // searching, and none of it depends on the query — so it is done once per
  // bookmark change instead.
  const searchIndex = useMemo<SearchEntry[]>(() => getLiveBookmarks(bookmarks).map((bookmark) => ({
    bookmark,
    listId: bookmark.listId,
    titleLower: bookmark.title.toLowerCase(),
    urlLower: bookmark.url.toLowerCase(),
    tagsLower: getTags(bookmark).map((tag) => tag.toLowerCase()),
    createdAtMs: getCreatedAtMs(bookmark.createdAt),
  })), [bookmarks])

  // `drawer` is rebuilt on every render of the parent, so this depends on the
  // individual fields it reads rather than the object itself.
  const { searchQuery, sortType, filterListId, filterTags } = drawer
  const filteredBookmarks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const tags = filterTags.map((tag) => tag.toLowerCase())
    const matched = searchIndex.filter((entry) => {
      if (filterListId !== 'all' && entry.listId !== filterListId) return false
      if (tags.length && !tags.every((tag) => entry.tagsLower.includes(tag))) return false
      if (!query) return true
      return entry.titleLower.includes(query) || entry.urlLower.includes(query)
    })

    matched.sort((a, b) => {
      switch (sortType) {
        case 'az':
          return a.titleLower.localeCompare(b.titleLower)
        case 'za':
          return b.titleLower.localeCompare(a.titleLower)
        case 'newest':
          return b.createdAtMs - a.createdAtMs
        case 'oldest':
          return a.createdAtMs - b.createdAtMs
        default:
          return 0
      }
    })

    return matched.map((entry) => entry.bookmark)
  }, [searchIndex, searchQuery, sortType, filterListId, filterTags])

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
            contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
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
          <NoriText className="mt-4 text-base font-medium text-stone-500">{t('bookmarks.noSearchResults')}</NoriText>
          <NoriText className="mt-1 text-sm text-stone-600 dark:text-stone-500">{t('bookmarks.noSearchResultsHint')}</NoriText>
        </View>
      )}
    </GestureDetector>
  )
}
