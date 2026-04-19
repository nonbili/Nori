import { useEffect } from 'react'
import { useShareIntent } from 'expo-share-intent'
import { ui$ } from '@/states/ui'
import { getFallbackIcon, getMeta } from '@/lib/bookmark'
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

  useEffect(() => {
    if (!hasShareIntent) {
      return
    }

    const url = parseSharedUrl({
      webUrl: shareIntent.webUrl || undefined,
      text: shareIntent.text || undefined,
    })

    if (!url) {
      showToast('Shared content did not contain a valid link')
      resetShareIntent()
      return
    }

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
  }, [hasShareIntent, shareIntent.text, shareIntent.webUrl, resetShareIntent])
}
