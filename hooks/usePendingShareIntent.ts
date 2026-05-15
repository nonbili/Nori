import { useEffect, useRef } from 'react'
import { useShareIntent } from 'expo-share-intent'
import { ui$ } from '@/states/ui'
import { getFallbackIcon, getMeta } from '@/lib/bookmark'
import { importBookmarksFromAsset } from '@/lib/bookmark-import'
import { parseSharedUrl } from '@/lib/share-intent'
import { showToast } from '@/lib/toast'

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const usePendingShareIntent = () => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const handledShareKey = useRef<string | null>(null)

  useEffect(() => {
    if (!hasShareIntent) {
      handledShareKey.current = null
      return
    }

    const sharedFile = shareIntent.files?.[0]
    if (sharedFile) {
      const shareKey = `file:${sharedFile.path}:${sharedFile.fileName || ''}`
      if (handledShareKey.current === shareKey) {
        return
      }
      handledShareKey.current = shareKey
      void importBookmarksFromAsset({
        uri: sharedFile.path,
        name: sharedFile.fileName,
        mimeType: sharedFile.mimeType,
      })
        .then((count) => {
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

    const shareKey = `url:${url}`
    if (handledShareKey.current === shareKey) {
      return
    }
    handledShareKey.current = shareKey

    ui$.pendingShare.set({
      url,
      title: getHostLabel(url),
      icon: getFallbackIcon(url),
    })

    let active = true
    void getMeta(url).then((meta) => {
      if (!active) {
        return
      }

      const current = ui$.pendingShare.get()
      if (!current || current.url !== url) {
        return
      }

      ui$.pendingShare.set({
        ...current,
        title: meta.title || current.title,
        icon: meta.icon || current.icon,
      })
    })

    return () => {
      active = false
    }
  }, [hasShareIntent, shareIntent.files, shareIntent.text, shareIntent.webUrl, resetShareIntent])
}
