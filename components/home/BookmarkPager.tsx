import { Alert, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useEffect, useMemo, useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getAvailableBookmarks, getVisibleBookmarks, getVisibleLists } from '@/lib/nori-data'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { useThemeColors } from '@/lib/theme'
import { showToast } from '@/lib/toast'
import { BookmarkTile } from '@/components/bookmark/BookmarkItem'
import { ListChip } from '@/components/list/ListChip'
import { SortableGrid } from '@/components/bookmark/SortableGrid'
import { SectionLabel } from '@/components/common/Common'
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'

const TILE_HEIGHT = 46

export const BookmarkPager: React.FC = () => {
  const themeColors = useThemeColors()
  const lists = useValue(lists$.lists)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const selectedListId = useValue(settings$.lastSelectedListId)
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const selectedBookmarkId = useValue(ui$.selectedBookmarkId)
  const pagerRef = useAnimatedRef<Animated.ScrollView>()
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  const pagerScrollX = useSharedValue(0)
  const pagerIndexRef = useRef(-1)
  const suppressScrollSyncRef = useRef(false)
  const { width: windowWidth } = useWindowDimensions()
  const visibleLists = getVisibleLists(lists)
  const selectedList = useMemo(
    () => visibleLists.find((item) => item.id === selectedListId) || visibleLists[0] || null,
    [selectedListId, visibleLists],
  )
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

  useEffect(() => {
    if (selectedListIndex !== -1) {
      if (pagerIndexRef.current === -1) {
        pagerIndexRef.current = selectedListIndex
        pagerRef.current?.scrollTo({ x: selectedListIndex * windowWidth, animated: false })
        return
      }

      if (pagerIndexRef.current !== selectedListIndex) {
        suppressScrollSyncRef.current = true
        pagerRef.current?.scrollTo({ x: selectedListIndex * windowWidth, animated: true })
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

  const openNewBookmark = () => {
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
          bookmarks$.delete(selectedBookmark.id)
          showToast('Bookmark deleted')
          ui$.selectedBookmarkId.set(null)
        },
      },
    ])
  }

  return (
    <View className="flex-1">
      <View className="mb-8 mt-4 px-6">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-6">
          {visibleLists.map((list, index) => (
            <ListChip
              key={list.id}
              name={list.name}
              index={index}
              pagerScrollX={pagerScrollX}
              pageWidth={windowWidth}
              onPress={() => settings$.setLastSelectedListId(list.id)}
            />
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
          suppressScrollSyncRef.current = false
          syncPagerSelection(e)
        }}
        scrollEventThrottle={16}
        scrollEnabled={!bookmarkEditMode}
        className="flex-1"
      >
        {visibleLists.map((list) => {
          const listBookmarks = getVisibleBookmarks(bookmarks, list.id)
          const availableBookmarks = getAvailableBookmarks(bookmarks, list.id)
          const isSelected = list.id === selectedList?.id

          return (
            <View key={list.id} className="flex-1" style={{ width: windowWidth }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerClassName="grow justify-center px-6 py-4"
                className="flex-1"
              >
                <View className="gap-8">
                  {!bookmarkEditMode && listBookmarks.length === 0 ? (
                    <View className="items-center gap-4 rounded-[28px] border border-stone-200 bg-white/90 px-6 py-8 dark:border-stone-800 dark:bg-stone-900/60">
                      <View className="h-14 w-14 items-center justify-center rounded-[20px] border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-950">
                        <MaterialIcons name="bookmark-border" size={26} color={themeColors.iconSubtle} />
                      </View>
                      <View className="items-center gap-2">
                        <Text className="text-base font-semibold text-stone-900 dark:text-stone-100">No links in {list.name} yet</Text>
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
                  ) : null}

                  {bookmarkEditMode && isSelected ? (
                    <View className="mb-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                      <View className="flex-row items-center gap-3">
                        <View className="h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                          <MaterialIcons name="edit" size={16} color={themeColors.iconAccent} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">Editing bookmarks</Text>
                          <Text className="mt-0.5 text-[11px] leading-4 text-emerald-900 dark:text-emerald-50">
                            Drag to reorder. Tap a bookmark for quick actions.
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <SortableGrid
                    items={listBookmarks}
                    itemHeight={TILE_HEIGHT}
                    editMode={bookmarkEditMode && isSelected}
                    scrollViewRef={scrollViewRef}
                    onReorder={(newOrder) => bookmarks$.reorder(list.id, newOrder)}
                    trailingItem={
                      !bookmarkEditMode ? (
                        <Pressable
                          onPress={openNewBookmark}
                          className="flex-row items-center gap-2 rounded-full border border-dashed border-stone-300 bg-transparent px-3 py-2.5 active:opacity-70 dark:border-stone-700"
                        >
                          <View className="h-6 w-6 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-900">
                            <MaterialIcons name="add" size={16} color={themeColors.iconSubtle} />
                          </View>
                          <Text className="text-sm font-medium text-stone-600 dark:text-stone-400">Add link</Text>
                        </Pressable>
                      ) : null
                    }
                    renderItem={(bookmark, isDragging) => (
                      <BookmarkTile
                        bookmark={bookmark}
                        editMode={bookmarkEditMode && isSelected}
                        selected={selectedBookmarkId === bookmark.id}
                        onSelect={() =>
                          ui$.selectedBookmarkId.set(ui$.selectedBookmarkId.get() === bookmark.id ? null : bookmark.id)
                        }
                        onOpen={() => {
                          if (bookmarkEditMode && isSelected) {
                            ui$.selectedBookmarkId.set(ui$.selectedBookmarkId.get() === bookmark.id ? null : bookmark.id)
                          } else {
                            void openBookmarkAction(bookmark)
                          }
                        }}
                        onEdit={() => {
                          ui$.bookmarkEditor.set({
                            id: bookmark.id,
                            url: bookmark.url,
                            title: bookmark.title,
                            icon: bookmark.icon || '',
                            listId: bookmark.listId || selectedList?.id || '',
                          })
                        }}
                        onCopyUrl={() => {
                          void Clipboard.setStringAsync(bookmark.url)
                          showToast('URL copied')
                        }}
                        onShare={() => {
                          void Share.share({ url: bookmark.url, message: bookmark.url })
                        }}
                        isDragging={isDragging}
                      />
                    )}
                  />

                  {bookmarkEditMode && isSelected && availableBookmarks.length ? (
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
        })}
      </Animated.ScrollView>

      <View className="absolute bottom-16 right-6 left-6 z-10 flex-row items-center justify-between">
        {bookmarkEditMode && selectedBookmark ? (
          <View className="flex-row items-center gap-4">
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
          <View />
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
              : 'bg-stone-200 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700'
          }`}
        >
          <MaterialIcons
            name={bookmarkEditMode ? 'check' : 'edit'}
            size={18}
            color={bookmarkEditMode ? '#ffffff' : themeColors.iconMuted}
          />
        </Pressable>
      </View>
      {!bookmarkEditMode ? (
        <View className="items-center py-4">
          <Pressable onPress={() => ui$.drawerOpen.set(true)} className="items-center">
            <View className="h-1 w-12 rounded-full bg-stone-300 dark:bg-stone-800" />
            <MaterialIcons name="keyboard-arrow-up" size={24} color={themeColors.iconMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}
