import { useValue } from '@legendapp/state/react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ActionChip } from '@/components/common/Common'
import { Sheet } from '@/components/modal/BaseModal'
import { useShareIntent } from 'expo-share-intent'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getFallbackIcon, getMeta } from '@/lib/bookmark'
import { getVisibleLists } from '@/lib/nori-data'
import { showToast } from '@/lib/toast'

export const SaveSharedLinkSheet: React.FC = () => {
  const { t } = useTranslation()
  const lists = useValue(lists$.lists)
  const pendingShare = useValue(ui$.pendingShare)
  const visibleLists = getVisibleLists(lists)
  const { resetShareIntent } = useShareIntent()

  const onClose = () => {
    ui$.pendingShare.set(null)
    resetShareIntent()
  }

  const onSaveToList = async (listId: string) => {
    if (!pendingShare) {
      return
    }

    const share = pendingShare
    ui$.pendingShare.set(null)
    resetShareIntent()

    const meta = await getMeta(share.url)
    const id = bookmarks$.add({
      listId,
      url: share.url,
      title: meta.title || share.title,
      icon: meta.icon || share.icon || getFallbackIcon(share.url),
    })

    if (id) {
      settings$.setLastSelectedListId(listId)
      showToast(t('sharing.savedToList', { name: visibleLists.find((item) => item.id === listId)?.name || t('lists.name') }))
    }
  }

  return (
    <Sheet visible={pendingShare != null} title={t('sharing.title')} onClose={onClose}>
      {pendingShare ? (
        <View className="gap-4">
          <View className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <Text className="text-base font-semibold text-stone-900 dark:text-stone-50">{pendingShare.title}</Text>
            <Text className="mt-2 text-sm text-stone-500 dark:text-stone-400">{pendingShare.url}</Text>
          </View>
          <Text className="text-sm text-stone-600 dark:text-stone-400">{t('sharing.pickList')}</Text>
          <View className="gap-3">
            {visibleLists.map((list) => (
              <ActionChip key={list.id} icon="bookmark-add" label={list.name} onPress={() => void onSaveToList(list.id)} />
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
