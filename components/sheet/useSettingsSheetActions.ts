import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useEffect, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import NoriBilling from '@/modules/nori-billing'
import {
  exportBookmarksToHtml,
  exportBookmarksToJson,
  exportBookmarksToPlainText,
  isBookmarkBackupText,
  parseBookmarksBackup,
  type BookmarkTransferFormat,
} from '@/lib/bookmark-transfer'
import {
  importBookmarksFromText,
  readBookmarkImportText,
  restoreBookmarksFromBackup,
} from '@/lib/bookmark-import'
import { confirmAction } from '@/lib/confirm'
import { prepareIosPurchase, syncIosTransaction } from '@/lib/nori-api'
import { openDeleteAccount, openManagePlan } from '@/lib/supabase/auth'
import { syncSupabase, SYNC_PENDING_ERROR } from '@/lib/supabase/sync'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { auth$, refreshEntitlement } from '@/states/auth'
import { isIos, isWeb } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import type { SettingsBusyAction } from '@/components/sheet/SettingsSheetSections'

const IOS_SYNC_PRODUCT_ID = process.env.EXPO_PUBLIC_NORI_IOS_SYNC_PRODUCT_ID || 'jp.nonbili.nori.sync'

const TRANSFER_MIME = {
  html: 'text/html',
  plain: 'text/plain',
  json: 'application/json',
} as const

const TRANSFER_EXTENSION = {
  html: 'html',
  plain: 'txt',
  json: 'json',
} as const

const TRANSFER_UTI = {
  html: 'public.html',
  plain: 'public.plain-text',
  json: 'public.json',
} as const

const TRANSFER_BUSY_ACTION = {
  html: 'export-html',
  plain: 'export-plain',
  json: 'export-json',
} as const

const downloadOnWeb = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function useSettingsSheetActions() {
  const { t } = useTranslation()
  const lists = useValue(lists$.lists)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const userEmail = useValue(auth$.userEmail)
  const accessToken = useValue(auth$.accessToken)
  const [loadingProduct, setLoadingProduct] = useState(isIos)
  const [productPrice, setProductPrice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [busyAction, setBusyAction] = useState<SettingsBusyAction>(null)
  const [pendingExternalAction, setPendingExternalAction] = useState<'delete-account' | null>(null)

  useEffect(() => {
    if (!isIos) {
      return
    }

    let active = true
    const loadProduct = async () => {
      try {
        const products = await NoriBilling.getProducts([IOS_SYNC_PRODUCT_ID])
        if (active) {
          setProductPrice(products[0]?.displayPrice)
        }
      } catch (error) {
        if (active) {
          setActionError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (active) {
          setLoadingProduct(false)
        }
      }
    }

    void loadProduct()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (pendingExternalAction !== 'delete-account') {
      return
    }
    setPendingExternalAction(null)
    if (!accessToken) {
      setActionError(t('settings.sync.signIn'))
      return
    }
    void openDeleteAccount(accessToken).catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error))
    })
  }, [accessToken, pendingExternalAction, t])

  const runAction = async (name: Exclude<SettingsBusyAction, null>, fn: () => Promise<void>) => {
    setBusyAction(name)
    setActionError(undefined)
    try {
      await fn()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(null)
    }
  }

  // syncSupabase rejects with a bare code so the sync module stays free of i18n.
  const requestSync = async () => {
    try {
      await syncSupabase()
    } catch (error) {
      if (error instanceof Error && error.message === SYNC_PENDING_ERROR) {
        throw new Error(t('settings.sync.errorPending'))
      }
      throw error
    }
  }

  const confirmAccountBinding = () =>
    confirmAction({
      title: t('settings.sync.confirmTitle'),
      message: t('settings.sync.confirmBody', { email: userEmail || 'your Nori account' }),
      cancelText: t('lists.cancel'),
      confirmText: t('bookmarks.save'),
    })

  const onPurchase = () =>
    runAction('buy', async () => {
      if (!accessToken || !userEmail) {
        throw new Error(t('settings.sync.errorSignInBuy'))
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      const prepared = await prepareIosPurchase(accessToken)
      const result = await NoriBilling.purchase(IOS_SYNC_PRODUCT_ID, prepared.appAccountToken)
      await syncIosTransaction(accessToken, result.signedTransactionInfo)
      await refreshEntitlement()
      await requestSync()
    })

  const onRestore = () =>
    runAction('restore', async () => {
      if (!accessToken || !userEmail) {
        throw new Error(t('settings.sync.errorSignInRestore'))
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      await prepareIosPurchase(accessToken)
      const entitlements = await NoriBilling.restore()
      const restored = entitlements.find((entry) => entry.productId === IOS_SYNC_PRODUCT_ID)
      if (!restored) {
        throw new Error(t('settings.sync.errorNoPurchase'))
      }
      await syncIosTransaction(accessToken, restored.signedTransactionInfo)
      await refreshEntitlement()
      await requestSync()
    })

  const onManage = () =>
    runAction('manage', async () => {
      if (isIos) {
        await NoriBilling.manageSubscriptions()
        return
      }
      await openManagePlan()
    })

  const onManualSync = () =>
    runAction('sync', async () => {
      await requestSync()
      await refreshEntitlement()
    })

  const confirmRestore = () =>
    confirmAction({
      title: t('settings.transfer.restoreTitle'),
      message: t('settings.transfer.restoreBody'),
      cancelText: t('lists.cancel'),
      confirmText: t('settings.transfer.restoreAction'),
      destructive: true,
    })

  const onImportBookmarks = () =>
    runAction('import', async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/html', 'text/plain', 'application/json', 'text/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
        base64: isWeb,
      })
      if (result.canceled) {
        return
      }

      const asset = result.assets[0]
      const content = await readBookmarkImportText(asset)

      if (isBookmarkBackupText(content)) {
        const backup = parseBookmarksBackup(content)
        if (!backup) {
          throw new Error(t('settings.transfer.restoreInvalid'))
        }
        if (!(await confirmRestore())) {
          return
        }
        const restoredCount = restoreBookmarksFromBackup(backup)
        showToast(t('settings.transfer.restored', { count: restoredCount }))
        return
      }

      const importedCount = importBookmarksFromText(content, asset)
      if (!importedCount) {
        showToast(t('settings.transfer.importEmpty'))
        return
      }
      showToast(t('settings.transfer.imported', { count: importedCount }))
    })

  const onExportBookmarks = (format: BookmarkTransferFormat) =>
    runAction(TRANSFER_BUSY_ACTION[format], async () => {
      const content = format === 'html'
        ? exportBookmarksToHtml(lists, bookmarks)
        : format === 'json'
          ? exportBookmarksToJson(lists, bookmarks)
          : exportBookmarksToPlainText(lists, bookmarks)
      const date = new Date().toISOString().slice(0, 10)
      const filename = `nori-bookmarks-${date}.${TRANSFER_EXTENSION[format]}`
      const mimeType = TRANSFER_MIME[format]

      if (isWeb) {
        downloadOnWeb(filename, content, mimeType)
        showToast(t('settings.transfer.exported'))
        return
      }

      const cacheDirectory = FileSystem.cacheDirectory
      if (!cacheDirectory) {
        throw new Error(t('settings.transfer.shareUnavailable'))
      }
      const uri = `${cacheDirectory}${filename}`
      await FileSystem.writeAsStringAsync(uri, content)
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error(t('settings.transfer.shareUnavailable'))
      }
      await Sharing.shareAsync(uri, {
        mimeType,
        UTI: TRANSFER_UTI[format],
        dialogTitle: t('settings.transfer.exportTitle'),
      })
    })

  return {
    actionError,
    busyAction,
    loadingProduct,
    productPrice,
    onPurchase,
    onRestore,
    onManage,
    onManualSync,
    onImportBookmarks,
    onExportBookmarks,
    onDeleteAccount: () => setPendingExternalAction('delete-account'),
  }
}
