import { InteractionManager, ScrollView, Share, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { showSnackbar, ui$ } from '@/states/ui'
import { getSortIndex, getTags, getVisibleLists, isDeleted, isVisible } from '@/lib/nori-data'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { useThemeColors } from '@/lib/theme'
import { showToast } from '@/lib/toast'
import { BookmarkPagerToolbar } from '@/components/home/BookmarkPagerToolbar'
import { BookmarkListChips, BookmarkPagerPages, type BookmarkPagerViewModel } from '@/components/home/BookmarkPagerViews'

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

export const BookmarkPager: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const lists = useValue(lists$.lists)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const selectedListId = useValue(settings$.lastSelectedListId)
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const selectedBookmarkIds = useValue(ui$.selectedBookmarkIds)
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
  const selectedIdSet = useMemo(() => new Set(selectedBookmarkIds), [selectedBookmarkIds])
  const selectedBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => selectedIdSet.has(bookmark.id)),
    [selectedIdSet, bookmarks],
  )
  const visibleListBookmarks = useMemo(
    () => (selectedList ? bookmarksByList.get(selectedList.id)?.visible ?? [] : []),
    [bookmarksByList, selectedList],
  )
  const allVisibleSelected = useMemo(
    () => visibleListBookmarks.length > 0 && visibleListBookmarks.every((bookmark) => selectedIdSet.has(bookmark.id)),
    [visibleListBookmarks, selectedIdSet],
  )

  const selectBookmark = useCallback((bookmark: BookmarkRecord) => {
    const current = ui$.selectedBookmarkIds.get()
    ui$.selectedBookmarkIds.set(
      current.includes(bookmark.id)
        ? current.filter((id) => id !== bookmark.id)
        : [...current, bookmark.id],
    )
  }, [])

  const selectAllBookmarks = useCallback(() => {
    const visibleIds = visibleListBookmarks.map((bookmark) => bookmark.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id))
    ui$.selectedBookmarkIds.set(allSelected ? [] : visibleIds)
  }, [visibleListBookmarks, selectedIdSet])

  const handleOpenBookmark = useCallback((bookmark: BookmarkRecord) => {
    void openBookmarkAction(bookmark)
  }, [])

  const openNewBookmark = useCallback(() => {
    if (!selectedList) {
      showToast(t('bookmarks.noListAvailable'))
      return
    }
    ui$.bookmarkEditor.set({
      url: '',
      title: '',
      icon: '',
      listId: selectedList.id,
      tags: [],
    })
  }, [selectedList, t])

  const editBookmark = useCallback((bookmark: BookmarkRecord) => {
    ui$.bookmarkEditor.set({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      icon: bookmark.icon || '',
      listId: bookmark.listId || selectedList?.id || '',
      tags: getTags(bookmark),
    })
  }, [selectedList?.id])

  const copyBookmarkUrl = useCallback((bookmark: BookmarkRecord) => {
    void Clipboard.setStringAsync(bookmark.url)
    showToast(t('bookmarks.urlCopied'))
  }, [t])

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
      ui$.selectedBookmarkIds.set([])
    }
  }, [bookmarkEditMode])

  useEffect(() => {
    ui$.selectedBookmarkIds.set([])
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
    if (!selectedBookmarks.length) {
      return
    }

    const snapshots = [...selectedBookmarks]
    bookmarks$.removeMany(snapshots.map((bookmark) => bookmark.id))
    ui$.selectedBookmarkIds.set([])
    showSnackbar(
      snapshots.length === 1 ? t('bookmarks.deleted') : t('bookmarks.deletedMany', { count: snapshots.length }),
      t('common.undo'),
      () => bookmarks$.restoreMany(snapshots),
    )
  }

  const shareSelectedBookmarks = useCallback(() => {
    if (!selectedBookmarks.length) {
      return
    }

    const urls = selectedBookmarks.map((bookmark) => bookmark.url)
    void Share.share(
      urls.length === 1
        ? { url: urls[0], message: urls[0] }
        : { message: urls.join('\n') },
    )
  }, [selectedBookmarks])

  const moveSelectedBookmarks = useCallback((targetListId: string) => {
    const snapshots = [...selectedBookmarks]
    if (!snapshots.length) {
      return
    }

    const moved = bookmarks$.moveManyToList(snapshots.map((bookmark) => bookmark.id), targetListId)
    ui$.selectedBookmarkIds.set([])
    if (!moved) {
      showToast(t('bookmarks.moveSkipped'))
      return
    }

    const listName = visibleLists.find((list) => list.id === targetListId)?.name || ''
    showSnackbar(
      moved === 1
        ? t('bookmarks.movedOne', { name: listName })
        : t('bookmarks.movedMany', { count: moved, name: listName }),
      t('common.undo'),
      () => bookmarks$.restoreMany(snapshots),
    )
  }, [selectedBookmarks, t, visibleLists])

  const hideSelectedBookmarks = useCallback(() => {
    const ids = ui$.selectedBookmarkIds.get()
    if (!ids.length) {
      return
    }
    bookmarks$.setVisibleMany(ids, false)
    ui$.selectedBookmarkIds.set([])
  }, [])

  const deleteBookmark = useCallback((bookmark: BookmarkRecord) => {
    bookmarks$.remove(bookmark.id)
    showSnackbar(t('bookmarks.deleted'), t('common.undo'), () => bookmarks$.restoreMany([bookmark]))
    const current = ui$.selectedBookmarkIds.get()
    if (current.includes(bookmark.id)) {
      ui$.selectedBookmarkIds.set(current.filter((id) => id !== bookmark.id))
    }
  }, [t])

  const pagerActions = {
    iconSubtleColor: themeColors.iconSubtle,
    iconAccentColor: themeColors.iconAccent,
    themeColors,
    scrollViewRef,
    onOpenBookmark: handleOpenBookmark,
    onOpenNewBookmark: openNewBookmark,
    onEditBookmark: editBookmark,
    onCopyBookmarkUrl: copyBookmarkUrl,
    onShareBookmark: shareBookmark,
    onDeleteBookmark: deleteBookmark,
    onSelectBookmark: selectBookmark,
    onSelectAll: selectAllBookmarks,
    onHideSelected: hideSelectedBookmarks,
    onMoveSelectedToList: moveSelectedBookmarks,
    onShareSelected: shareSelectedBookmarks,
    onBottomStateChange: setBookmarkListAtBottom,
    onRemoveSelectedBookmark: removeSelectedBookmark,
  }
  const pagerView: BookmarkPagerViewModel = {
    lists: visibleLists,
    bookmarkEditMode,
    chipScrollViewRef,
    pagerScrollX,
    pageWidth: windowWidth,
    themeColors,
    onChipRowLayout,
    onChipLayout,
    onSelectList: selectListFromChip,
    onChipScroll: (x) => {
      chipScrollXRef.current = x
    },
    bookmarksByList,
    selectedListId,
    selectedListIndex,
    immediatePagerIndex,
    renderNearbyPages,
    pagerRef,
    onPagerScroll,
    currentPagerIndex: pagerIndexRef.current === -1 ? selectedListIndex : pagerIndexRef.current,
    onMomentumSettled: (e) => {
      const pendingListId = pendingListSelectionRef.current
      if (pendingListId) {
        pendingListSelectionRef.current = null
        suppressScrollSyncRef.current = false
        settings$.setLastSelectedListId(pendingListId)
        return
      }
      suppressScrollSyncRef.current = false
      syncPagerSelection(e)
    },
  }

  return (
    <View className="flex-1">
        <BookmarkListChips pager={pagerView} />
        <BookmarkPagerPages pager={pagerView} actions={pagerActions} />

        <BookmarkPagerToolbar
          selectedCount={selectedBookmarks.length}
          moveTargetLists={visibleLists.filter((list) => list.id !== selectedList?.id)}
          allVisibleSelected={allVisibleSelected}
          hasVisibleBookmarks={visibleListBookmarks.length > 0}
          actions={pagerActions}
        />
      </View>
  )
}
