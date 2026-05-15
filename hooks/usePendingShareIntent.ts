import { useEffect, useRef } from 'react'
import { useShareIntent } from 'expo-share-intent'
import { ui$ } from '@/states/ui'
import { getFallbackIcon } from '@/lib/bookmark'
import { importBookmarksFromText, readBookmarkImportText } from '@/lib/bookmark-import'
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

const isHtmlFile = (file: { fileName?: string | null; mimeType?: string | null }) => {
  const name = file.fileName?.toLowerCase() || ''
  const mimeType = file.mimeType?.toLowerCase() || ''
  return mimeType.includes('html') || name.endsWith('.html') || name.endsWith('.htm')
}

export const usePendingShareIntent = () => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const handledShareKey = useRef<string | null>(null)

  useEffect(() => {
    if (!hasShareIntent) {
      handledShareKey.current = null
      return
    }

    const setPendingSharedUrl = (url: string) => {
      void prefetchBookmarkMeta(url)
      ui$.pendingShare.set({
        url,
        title: getHostLabel(url),
        icon: getFallbackIcon(url),
      })
    }

    const handleUrlShare = (url: string) => {
      const shareKey = `url:${url}`
      if (handledShareKey.current === shareKey) {
        return
      }
      handledShareKey.current = shareKey
      setPendingSharedUrl(url)
    }

    const sharedFile = shareIntent.files?.[0]
    if (sharedFile) {
      const shareKey = `file:${sharedFile.path}:${sharedFile.fileName || ''}`
      if (handledShareKey.current === shareKey) {
        return
      }
      handledShareKey.current = shareKey
      void readBookmarkImportText({
        uri: sharedFile.path,
        name: sharedFile.fileName,
        mimeType: sharedFile.mimeType,
      })
        .then((content) => {
          if (isHtmlFile(sharedFile) && !htmlLooksLikeBookmarkExport(content)) {
            showToast('No new bookmarks found')
            return
          }

          const count = importBookmarksFromText(content, {
            name: sharedFile.fileName,
            mimeType: sharedFile.mimeType,
          })
          showToast(count ? `Imported ${count} bookmarks` : 'No new bookmarks found')
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          handledShareKey.current = null
          resetShareIntent()
        })
      return
    }

    const url = parseSharedUrl({
      webUrl: shareIntent.webUrl || undefined,
      text: shareIntent.text || undefined,
    })

    if (!url) {
      showToast('Shared content did not contain a valid link')
      handledShareKey.current = null
      resetShareIntent()
      return
    }

    handleUrlShare(url)
  }, [hasShareIntent, shareIntent.files, shareIntent.text, shareIntent.webUrl, resetShareIntent])
}
