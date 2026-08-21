import { useValue } from '@legendapp/state/react'
import { useRef } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { ActionChip } from '@/components/common/Common'
import { Sheet } from '@/components/modal/BaseModal'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getFallbackIcon } from '@/lib/bookmark'
import { getPrefetchedBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { backfillMissingTitles } from '@/lib/title-backfill'
import { getVisibleLists } from '@/lib/nori-data'
import { showToast } from '@/lib/toast'

export const SaveSharedLinkSheet: React.FC = () => {
  const { t } = useTranslation()
  const { height: windowHeight } = useWindowDimensions()
  const lists = useValue(lists$.lists)
  const pendingShare = useValue(ui$.pendingShare)
  const visibleLists = getVisibleLists(lists)
  const scrollOffset = useSharedValue(0)
  const scrollRef = useRef(null)

  const handleScroll = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y
  }

  const onClose = () => {
    ui$.pendingShare.set(null)
    scrollOffset.value = 0
  }

  const onSaveToList = (listId: string) => {
    if (!pendingShare) {
      return
    }

    const items = pendingShare.items
    ui$.pendingShare.set(null)

    const saved = items.flatMap((share) => {
      const id = bookmarks$.add({
        listId,
        url: share.url,
        title: share.title,
        icon: share.icon || getFallbackIcon(share.url),
      })
      return id ? [{ id, share }] : []
    })

    if (saved.length === 0) {
      return
    }

    settings$.setLastSelectedListId(listId)
    const name = visibleLists.find((item) => item.id === listId)?.name || t('lists.name')
    showToast(
      saved.length > 1
        ? t('sharing.savedCountToList', { count: saved.length, name })
        : t('sharing.savedToList', { name }),
    )

    void Promise.all(saved.map(({ id, share }) => (
      getPrefetchedBookmarkMeta(share.url)
        .then((meta) => {
          if (meta.title || meta.icon) {
            bookmarks$.update(id, {
              title: meta.title || share.title,
              icon: meta.icon || share.icon || getFallbackIcon(share.url),
            })
          }
        })
        .catch(() => {})
    )))
      // If the fetch couldn't get a real title (e.g. a client-rendered SPA), fall
      // back to the hidden WebView to resolve it.
      .finally(() => {
        void backfillMissingTitles()
      })
  }

  return (
    <Sheet
      visible={pendingShare != null}
      title={pendingShare && pendingShare.items.length > 1 ? t('sharing.titleMultiple') : t('sharing.title')}
      height={windowHeight * 0.85}
      onClose={onClose}
      contentScrollRef={scrollRef}
      contentScrollOffset={scrollOffset}
    >
      {pendingShare ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-4 pb-4"
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View className="gap-3">
            {pendingShare.items.map((item) => (
              <View
                key={item.url}
                className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
              >
                <Text className="text-base font-semibold text-stone-900 dark:text-stone-50">{item.title}</Text>
                <Text className="mt-2 text-sm text-stone-500 dark:text-stone-400" numberOfLines={2}>{item.url}</Text>
              </View>
            ))}
          </View>
          <Text className="text-sm text-stone-600 dark:text-stone-400">
            {pendingShare.items.length > 1
              ? t('sharing.pickListMultiple', { count: pendingShare.items.length })
              : t('sharing.pickList')}
          </Text>
          <View className="gap-3">
            {visibleLists.map((list) => (
              <ActionChip key={list.id} icon="bookmark-add" label={list.name} onPress={() => onSaveToList(list.id)} />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </Sheet>
  )
}
