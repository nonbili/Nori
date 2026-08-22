import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { useIncomingShare, type ResolvedSharePayload, type SharePayload } from 'expo-sharing'
import { useTranslation } from 'react-i18next'
import { ui$ } from '@/states/ui'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { getFallbackIcon, getFallbackTitle } from '@/lib/bookmark'
import { countBookmarksInImportText, readBookmarkImportText } from '@/lib/bookmark-import'
import { prefetchBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { getVisibleLists } from '@/lib/nori-data'
import { resolveQuickShareTargetListId, saveQuickSharedLink } from '@/lib/quick-share'
import { htmlLooksLikeBookmarkExport, parseSharedUrls } from '@/lib/share-intent'
import { backfillMissingTitles } from '@/lib/title-backfill'
import { showToast } from '@/lib/toast'

interface SharedFile {
  uri: string
  name: string | null
  mimeType: string | null
}

const isHtmlFile = (file: SharedFile) => {
  const name = file.name?.toLowerCase() || ''
  const mimeType = file.mimeType?.toLowerCase() || ''
  return mimeType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')
}

const isFileUri = (uri: string | null | undefined) =>
  !!uri && !/^https?:\/\//i.test(uri)

const getPayloadsKey = (payloads: (SharePayload | ResolvedSharePayload)[]) =>
  payloads.map((payload) => `${payload.shareType}:${payload.value}`).join('|')

const looksLikeFilePayload = (payload: SharePayload) =>
  payload.shareType === 'audio'
  || payload.shareType === 'image'
  || payload.shareType === 'video'
  || payload.shareType === 'file'

const fileNameFromValue = (value: string) => {
  try {
    const decoded = decodeURIComponent(value)
    const last = decoded.split(/[/\\]/).pop() || ''
    return last || null
  } catch {
    return null
  }
}

const resolvedFile = (payloads: ResolvedSharePayload[]): SharedFile | null => {
  const payload = payloads.find((item) => isFileUri(item.contentUri))
  return payload?.contentUri
    ? { uri: payload.contentUri, name: payload.originalName, mimeType: payload.contentMimeType }
    : null
}

const rawFile = (payloads: SharePayload[]): SharedFile | null => {
  const payload = payloads.find((item) => looksLikeFilePayload(item) && isFileUri(item.value))
  return payload
    ? { uri: payload.value, name: fileNameFromValue(payload.value), mimeType: payload.mimeType ?? null }
    : null
}

// A single share can carry many links: several browser tabs arrive either as one payload
// per tab, or as one newline separated text payload.
const resolvedUrls = (payloads: ResolvedSharePayload[]) => [...new Set(payloads.flatMap((payload) => (
  payload.contentType === 'website' && payload.contentUri
    ? [payload.contentUri]
    : parseSharedUrls({ text: payload.value })
)))]

const rawUrls = (payloads: SharePayload[]) =>
  [...new Set(payloads.flatMap((payload) => parseSharedUrls({ text: payload.value })))]

/**
 * Handles shares coming in through the iOS share extension. Android delivers shares to
 * the native QuickShareReceiverActivity instead, which drains through `useQuickShare`.
 */
export const usePendingShareIntent = () => {
  const { t } = useTranslation()
  const { sharedPayloads, resolvedSharedPayloads, clearSharedPayloads, isResolving, error } = useIncomingShare()
  const handledPayloadsKey = useRef<string | null>(null)
  const placeholderShownRef = useRef(false)
  const resolutionRanRef = useRef(false)

  useEffect(() => {
    if (Platform.OS !== 'ios' || placeholderShownRef.current) {
      return
    }
    const raw = sharedPayloads[0]
    if (!raw || !looksLikeFilePayload(raw)) {
      return
    }
    placeholderShownRef.current = true
    ui$.pendingShare.set(null)
    ui$.pendingBookmarkImport.set({
      content: '',
      name: fileNameFromValue(raw.value),
      mimeType: raw.mimeType ?? null,
      count: 0,
      isParsing: true,
    })
  }, [sharedPayloads])

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return
    }
    if (isResolving) {
      resolutionRanRef.current = true
      return
    }
    if (sharedPayloads.length === 0) {
      handledPayloadsKey.current = null
      placeholderShownRef.current = false
      resolutionRanRef.current = false
      return
    }

    // Resolving enriches payloads (redirect targets, file URIs) but needs the network, so
    // it can fail or come back empty. Fall back to the raw payloads rather than sitting on
    // a share we can never handle; only wait while resolution still has a chance to run.
    const useRawPayloads = resolvedSharedPayloads.length === 0
    if (useRawPayloads && !error && !resolutionRanRef.current) {
      return
    }

    const payloads: (SharePayload | ResolvedSharePayload)[] = useRawPayloads ? sharedPayloads : resolvedSharedPayloads
    const key = getPayloadsKey(payloads)
    if (handledPayloadsKey.current === key) {
      return
    }
    handledPayloadsKey.current = key

    const done = () => {
      handledPayloadsKey.current = null
      placeholderShownRef.current = false
      resolutionRanRef.current = false
      clearSharedPayloads()
    }

    const handleUrls = (urls: string[]) => {
      ui$.pendingBookmarkImport.set(null)

      const targetListId = resolveQuickShareTargetListId()
      if (settings$.quickSaveSharedLinks.peek() && targetListId) {
        const saved = urls.filter((url) => saveQuickSharedLink(url, targetListId))
        if (saved.length > 0) {
          const name = getVisibleLists(lists$.lists.peek()).find((list) => list.id === targetListId)?.name
            || t('lists.name')
          showToast(
            saved.length > 1
              ? t('sharing.savedCountToList', { count: saved.length, name })
              : t('sharing.savedToList', { name }),
          )
          void backfillMissingTitles()
        }
        done()
        return
      }

      urls.forEach((url) => void prefetchBookmarkMeta(url))
      ui$.pendingShare.set({
        items: urls.map((url) => ({
          url,
          title: getFallbackTitle(url),
          icon: getFallbackIcon(url),
        })),
      })
      done()
    }

    const handleFile = (file: SharedFile) => {
      ui$.pendingShare.set(null)
      ui$.pendingBookmarkImport.set({
        content: '',
        name: file.name,
        mimeType: file.mimeType,
        count: 0,
        isParsing: true,
      })

      void readBookmarkImportText({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType,
      })
        .then((content) => {
          const count = isHtmlFile(file) && !htmlLooksLikeBookmarkExport(content)
            ? 0
            : countBookmarksInImportText(content, {
                name: file.name,
                mimeType: file.mimeType,
              })

          ui$.pendingBookmarkImport.set({
            content,
            name: file.name,
            mimeType: file.mimeType,
            count,
            isParsing: false,
          })
        })
        .catch((readError) => {
          console.warn('Failed to read shared bookmark file', {
            contentUri: file.uri,
            originalName: file.name,
            contentMimeType: file.mimeType,
            error: readError,
          })
          ui$.pendingBookmarkImport.set(null)
          showToast(t('sharing.readFileFailed'))
        })
        .finally(done)
    }

    const file = useRawPayloads ? rawFile(sharedPayloads) : resolvedFile(resolvedSharedPayloads)
    if (file) {
      handleFile(file)
      return
    }

    const urls = useRawPayloads ? rawUrls(sharedPayloads) : resolvedUrls(resolvedSharedPayloads)
    if (urls.length > 0) {
      handleUrls(urls)
      return
    }

    ui$.pendingBookmarkImport.set(null)
    showToast(t('sharing.noLinkFound'))
    done()
  }, [sharedPayloads, resolvedSharedPayloads, isResolving, error, clearSharedPayloads, t])
}
