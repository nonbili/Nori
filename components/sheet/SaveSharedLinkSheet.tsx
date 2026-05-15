import { useValue } from '@legendapp/state/react'
import { useRef } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { ActionChip } from '@/components/common/Common'
import { Sheet } from '@/components/modal/BaseModal'
import { clearSharedPayloads } from 'expo-sharing'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getFallbackIcon } from '@/lib/bookmark'
import { getPrefetchedBookmarkMeta } from '@/lib/bookmark-meta-cache'
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
    clearSharedPayloads()
    scrollOffset.value = 0
  }

  const onSaveToList = (listId: string) => {
    if (!pendingShare) {
      return
    }

    const share = pendingShare
    ui$.pendingShare.set(null)
    clearSharedPayloads()

    const id = bookmarks$.add({
      listId,
      url: share.url,
      title: share.title,
      icon: share.icon || getFallbackIcon(share.url),
    })

    if (id) {
      settings$.setLastSelectedListId(listId)
      showToast(t('sharing.savedToList', { name: visibleLists.find((item) => item.id === listId)?.name || t('lists.name') }))
      void getPrefetchedBookmarkMeta(share.url)
        .then((meta) => {
          if (meta.title || meta.icon) {
            bookmarks$.update(id, {
              title: meta.title || share.title,
              icon: meta.icon || share.icon || getFallbackIcon(share.url),
            })
          }
        })
        .catch(() => {})
    }
  }

  return (
    <Sheet
      visible={pendingShare != null}
      title={t('sharing.title')}
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
          <View className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <Text className="text-base font-semibold text-stone-900 dark:text-stone-50">{pendingShare.title}</Text>
            <Text className="mt-2 text-sm text-stone-500 dark:text-stone-400">{pendingShare.url}</Text>
          </View>
          <Text className="text-sm text-stone-600 dark:text-stone-400">{t('sharing.pickList')}</Text>
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
