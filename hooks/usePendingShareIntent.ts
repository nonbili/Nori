import { useEffect, useRef } from 'react'
import { useIncomingShare, type ResolvedSharePayload, type SharePayload } from 'expo-sharing'
import { ui$ } from '@/states/ui'
import { getFallbackIcon } from '@/lib/bookmark'
import { countBookmarksInImportText, readBookmarkImportText } from '@/lib/bookmark-import'
import { prefetchBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { htmlLooksLikeBookmarkExport, parseSharedUrl } from '@/lib/share-intent'
import { showToast } from '@/lib/toast'

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const isHtmlPayload = (payload: ResolvedSharePayload) => {
  const name = payload.originalName?.toLowerCase() || ''
  const mimeType = payload.contentMimeType?.toLowerCase() || ''
  return mimeType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')
}

const isFileUri = (uri: string | null | undefined) =>
  !!uri && !/^https?:\/\//i.test(uri)

const getPayloadKey = (payload: ResolvedSharePayload) =>
  `${payload.contentType ?? 'text'}:${payload.contentUri ?? ''}:${payload.value}`

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

export const usePendingShareIntent = () => {
  const { sharedPayloads, resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare()
  const handledPayloadKey = useRef<string | null>(null)
  const placeholderShownRef = useRef(false)

  useEffect(() => {
    if (placeholderShownRef.current) {
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
    if (isResolving) {
      return
    }
    if (resolvedSharedPayloads.length === 0) {
      handledPayloadKey.current = null
      placeholderShownRef.current = false
      return
    }

    const payload = resolvedSharedPayloads[0]
    const key = getPayloadKey(payload)
    if (handledPayloadKey.current === key) {
      return
    }
    handledPayloadKey.current = key

    const handleUrl = (url: string) => {
      ui$.pendingBookmarkImport.set(null)
      void prefetchBookmarkMeta(url)
      ui$.pendingShare.set({
        url,
        title: getHostLabel(url),
        icon: getFallbackIcon(url),
      })
    }

    const handleFile = (uri: string) => {
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
          showToast('Could not read shared file')
        })
        .finally(() => {
          handledPayloadKey.current = null
          clearSharedPayloads()
        })
    }

    if (payload.contentUri && isFileUri(payload.contentUri)) {
      handleFile(payload.contentUri)
      return
    }

    if (payload.contentType === 'website' && payload.contentUri) {
      handleUrl(payload.contentUri)
      return
    }

    const url = parseSharedUrl({ text: payload.value })
    if (url) {
      handleUrl(url)
      return
    }

    ui$.pendingBookmarkImport.set(null)
    showToast('Shared content did not contain a valid link')
    handledPayloadKey.current = null
    clearSharedPayloads()
  }, [resolvedSharedPayloads, isResolving, clearSharedPayloads])
}
