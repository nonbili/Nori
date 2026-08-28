import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { useMemo, useRef } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { Sheet } from '@/components/modal/BaseModal'
import { importBookmarksFromText, restoreBookmarksFromBackup } from '@/lib/bookmark-import'
import { confirmAction } from '@/lib/confirm'
import { isBookmarkBackupText, parseBookmarksBackup, type BookmarkBackupData } from '@/lib/bookmark-transfer'
import { showToast } from '@/lib/toast'
import { ui$ } from '@/states/ui'

export const BookmarkImportSheet: React.FC = () => {
  const { t } = useTranslation()
  const pendingImport = useValue(ui$.pendingBookmarkImport)
  const restoringRef = useRef(false)

  const onClose = () => {
    ui$.pendingBookmarkImport.set(null)
  }

  const content = pendingImport?.content || ''
  const isBackup = isBookmarkBackupText(content)
  const backup = useMemo(() => isBackup ? parseBookmarksBackup(content) : null, [content, isBackup])

  const confirmBackupRestore = async (parsedBackup: BookmarkBackupData) => {
    const confirmed = await confirmAction({
      title: t('settings.transfer.restoreTitle'),
      message: t('settings.transfer.restoreBody'),
      cancelText: t('bookmarks.cancel'),
      confirmText: t('settings.transfer.restoreAction'),
      destructive: true,
    })
    if (!confirmed) {
      return
    }
    try {
      const restoredCount = restoreBookmarksFromBackup(parsedBackup)
      showToast(t('settings.transfer.restored', { count: restoredCount }))
    } catch {
      showToast(t('settings.transfer.restoreInvalid'))
    } finally {
      ui$.pendingBookmarkImport.set(null)
    }
  }

  const onImport = () => {
    // The confirm is awaited, so the button stays live until the restore
    // finishes — without this a second tap would restore twice.
    if (!pendingImport || pendingImport.isParsing || restoringRef.current) {
      return
    }

    // A backup with only lists or only tombstones counts zero live bookmarks but
    // is still restorable, so availability follows the file kind, not the count.
    if (isBackup) {
      if (backup) {
        restoringRef.current = true
        void confirmBackupRestore(backup).finally(() => {
          restoringRef.current = false
        })
      }
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
  const canSubmit = !isParsing && (backup != null || (!isBackup && count > 0))
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
              <NoriText className="text-base font-semibold text-stone-900 dark:text-stone-50">{title}</NoriText>
            </View>
            {pendingImport.name ? (
              <NoriText className="mt-2 text-sm text-stone-500 dark:text-stone-400" numberOfLines={1}>
                {pendingImport.name}
              </NoriText>
            ) : null}
            {isBackup && !isParsing ? (
              <NoriText className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {t(backup ? 'settings.transfer.restoreBody' : 'settings.transfer.restoreInvalid')}
              </NoriText>
            ) : null}
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onClose}
              className="rounded-full bg-stone-200 px-5 py-3 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
            >
              <NoriText className="font-medium text-stone-900 dark:text-stone-100">
                {isParsing || canSubmit ? t('bookmarks.cancel') : t('settings.transfer.close')}
              </NoriText>
            </Pressable>
            {canSubmit ? (
              <Pressable
                onPress={onImport}
                className={`rounded-full px-5 py-3 ${isBackup ? 'bg-rose-600 active:bg-rose-700' : 'bg-emerald-500 active:bg-emerald-600'}`}
              >
                <NoriText className="font-medium text-white">
                  {isBackup ? t('settings.transfer.restoreAction') : t('settings.transfer.importAction')}
                </NoriText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  )
}
