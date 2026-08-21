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

const isHtmlPayload = (payload: ResolvedSharePayload) => {
  const name = payload.originalName?.toLowerCase() || ''
  const mimeType = payload.contentMimeType?.toLowerCase() || ''
  return mimeType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')
}

const isFileUri = (uri: string | null | undefined) =>
  !!uri && !/^https?:\/\//i.test(uri)

const isFilePayload = (payload: ResolvedSharePayload) =>
  isFileUri(payload.contentUri)

const getPayloadsKey = (payloads: ResolvedSharePayload[]) =>
  payloads.map((payload) => `${payload.contentType ?? 'text'}:${payload.contentUri ?? ''}:${payload.value}`).join('|')

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

/**
 * Handles shares coming in through the iOS share extension. Android delivers shares to
 * the native QuickShareReceiverActivity instead, which drains through `useQuickShare`.
 */
export const usePendingShareIntent = () => {
  const { t } = useTranslation()
  const { sharedPayloads, resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare()
  const handledPayloadsKey = useRef<string | null>(null)
  const placeholderShownRef = useRef(false)

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
    if (Platform.OS !== 'ios' || isResolving) {
      return
    }
    if (resolvedSharedPayloads.length === 0) {
      handledPayloadsKey.current = null
      placeholderShownRef.current = false
      return
    }

    const key = getPayloadsKey(resolvedSharedPayloads)
    if (handledPayloadsKey.current === key) {
      return
    }
    handledPayloadsKey.current = key

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
        handledPayloadsKey.current = null
        clearSharedPayloads()
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
      handledPayloadsKey.current = null
      clearSharedPayloads()
    }

    const handleFile = (payload: ResolvedSharePayload, uri: string) => {
      ui$.pendingShare.set(null)
      ui$.pendingBookmarkImport.set({
        content: '',
        name: payload.originalName,
        mimeType: payload.contentMimeType,
        count: 0,
        isParsing: true,
      })

      void readBookmarkImportText({
        uri,
        name: payload.originalName,
        mimeType: payload.contentMimeType,
      })
        .then((content) => {
          const count = isHtmlPayload(payload) && !htmlLooksLikeBookmarkExport(content)
            ? 0
            : countBookmarksInImportText(content, {
                name: payload.originalName,
                mimeType: payload.contentMimeType,
              })

          ui$.pendingBookmarkImport.set({
            content,
            name: payload.originalName,
            mimeType: payload.contentMimeType,
            count,
            isParsing: false,
          })
        })
        .catch((error) => {
          console.warn('Failed to read shared bookmark file', {
            contentUri: uri,
            originalName: payload.originalName,
            contentMimeType: payload.contentMimeType,
            error,
          })
          ui$.pendingBookmarkImport.set(null)
          showToast(t('sharing.readFileFailed'))
        })
        .finally(() => {
          handledPayloadsKey.current = null
          clearSharedPayloads()
        })
    }

    const filePayload = resolvedSharedPayloads.find(isFilePayload)
    if (filePayload?.contentUri) {
      handleFile(filePayload, filePayload.contentUri)
      return
    }

    // A single share can carry many links: several browser tabs arrive either as one
    // payload per tab, or as one newline separated text payload.
    const urls = [...new Set(resolvedSharedPayloads.flatMap((payload) => (
      payload.contentType === 'website' && payload.contentUri
        ? [payload.contentUri]
        : parseSharedUrls({ text: payload.value })
    )))]

    if (urls.length > 0) {
      handleUrls(urls)
      return
    }

    ui$.pendingBookmarkImport.set(null)
    showToast(t('sharing.noLinkFound'))
    handledPayloadsKey.current = null
    clearSharedPayloads()
  }, [resolvedSharedPayloads, isResolving, clearSharedPayloads, t])
}
