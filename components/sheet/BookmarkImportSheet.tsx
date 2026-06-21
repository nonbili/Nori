import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Sheet } from '@/components/modal/BaseModal'
import { importBookmarksFromText } from '@/lib/bookmark-import'
import { showToast } from '@/lib/toast'
import { ui$ } from '@/states/ui'

export const BookmarkImportSheet: React.FC = () => {
  const { t } = useTranslation()
  const pendingImport = useValue(ui$.pendingBookmarkImport)

  const onClose = () => {
    ui$.pendingBookmarkImport.set(null)
  }

  const onImport = () => {
    if (!pendingImport || pendingImport.isParsing || pendingImport.count <= 0) {
      return
    }

    const importedCount = importBookmarksFromText(pendingImport.content, {
      name: pendingImport.name,
      mimeType: pendingImport.mimeType,
    })
    ui$.pendingBookmarkImport.set(null)
    showToast(importedCount ? t('settings.transfer.imported', { count: importedCount }) : t('settings.transfer.importEmpty'))
  }

  const isParsing = pendingImport?.isParsing ?? false
  const count = pendingImport?.count ?? 0
  const title = isParsing
    ? t('settings.transfer.readingFile')
    : count === 1
    ? t('settings.transfer.foundOne')
    : t('settings.transfer.foundCount', { count })

  return (
    <Sheet visible={pendingImport != null} title={t('settings.transfer.import')} onClose={onClose}>
      {pendingImport ? (
        <View className="gap-5">
          <View className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <View className="flex-row items-center gap-3">
              {isParsing ? <ActivityIndicator size="small" /> : null}
              <Text className="text-base font-semibold text-stone-900 dark:text-stone-50">{title}</Text>
            </View>
            {pendingImport.name ? (
              <Text className="mt-2 text-sm text-stone-500 dark:text-stone-400" numberOfLines={1}>
                {pendingImport.name}
              </Text>
            ) : null}
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onClose}
              className="rounded-full bg-stone-200 px-5 py-3 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
            >
              <Text className="font-medium text-stone-900 dark:text-stone-100">
                {isParsing || count > 0 ? t('bookmarks.cancel') : t('settings.transfer.close')}
              </Text>
            </Pressable>
            {!isParsing && count > 0 ? (
              <Pressable onPress={onImport} className="rounded-full bg-emerald-500 px-5 py-3 active:bg-emerald-600">
                <Text className="font-medium text-white">{t('settings.transfer.importAction')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
