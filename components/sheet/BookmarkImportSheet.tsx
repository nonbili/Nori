import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { Sheet } from '@/components/modal/BaseModal'
import { importBookmarksFromText, restoreBookmarksFromBackupText } from '@/lib/bookmark-import'
import { isBookmarkBackupText } from '@/lib/bookmark-transfer'
import { showToast } from '@/lib/toast'
import { ui$ } from '@/states/ui'

export const BookmarkImportSheet: React.FC = () => {
  const { t } = useTranslation()
  const pendingImport = useValue(ui$.pendingBookmarkImport)

  const onClose = () => {
    ui$.pendingBookmarkImport.set(null)
  }

  const isBackup = pendingImport ? isBookmarkBackupText(pendingImport.content) : false

  const restoreBackup = (content: string) => {
    Alert.alert(
      t('settings.transfer.restoreTitle'),
      t('settings.transfer.restoreBody'),
      [
        { text: t('bookmarks.cancel'), style: 'cancel' },
        {
          text: t('settings.transfer.restoreAction'),
          style: 'destructive',
          onPress: () => {
            const restoredCount = restoreBookmarksFromBackupText(content)
            ui$.pendingBookmarkImport.set(null)
            showToast(
              restoredCount == null
                ? t('settings.transfer.restoreInvalid')
                : t('settings.transfer.restored', { count: restoredCount }),
            )
          },
        },
      ],
    )
  }

  const onImport = () => {
    if (!pendingImport || pendingImport.isParsing) {
      return
    }

    // A backup with only lists or only tombstones counts zero live bookmarks but
    // is still restorable, so availability follows the file kind, not the count.
    if (isBackup) {
      restoreBackup(pendingImport.content)
      return
    }

    if (pendingImport.count <= 0) {
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
  const canSubmit = !isParsing && (isBackup || count > 0)
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
            {isBackup && !isParsing ? (
              <Text className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {t('settings.transfer.restoreBody')}
              </Text>
            ) : null}
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onClose}
              className="rounded-full bg-stone-200 px-5 py-3 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
            >
              <Text className="font-medium text-stone-900 dark:text-stone-100">
                {isParsing || canSubmit ? t('bookmarks.cancel') : t('settings.transfer.close')}
              </Text>
            </Pressable>
            {canSubmit ? (
              <Pressable
                onPress={onImport}
                className={`rounded-full px-5 py-3 ${isBackup ? 'bg-rose-600 active:bg-rose-700' : 'bg-emerald-500 active:bg-emerald-600'}`}
              >
                <Text className="font-medium text-white">
                  {isBackup ? t('settings.transfer.restoreAction') : t('settings.transfer.importAction')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
