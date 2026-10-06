import { useEffect, useReducer, useState } from 'react'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { NoriText } from '@/components/common/NoriText'
import { Favicon } from './Favicon'
import {
  getCachedBookmarkPreview,
  loadBookmarkPreview,
  onPreviewChange,
  previewSource,
  type BookmarkPreview,
} from '@/lib/bookmark-preview'
import { previewKey } from '@/lib/bookmark-preview-types'

const IMAGE_WIDTH = 104
const IMAGE_HEIGHT = 80
// Wide page images (GitHub cards, banners) are shown whole up to 2:1 rather than cropped to the slot.
const IMAGE_MIN_HEIGHT = IMAGE_WIDTH / 2
// Remembered across mounts, so a recycled row sizes its image before it loads again. Keyed by
// preview key, not image uri: web and desktop uris are data urls holding the whole image.
const imageRatios = new Map<string, number>()

function imageHeight(key: string) {
  const ratio = imageRatios.get(key)
  return ratio ? Math.min(IMAGE_HEIGHT, Math.max(IMAGE_MIN_HEIGHT, IMAGE_WIDTH / ratio)) : IMAGE_HEIGHT
}

export function BookmarkPreviewContent({
  bookmark,
  cachedOnly = false,
  titleClassName = 'text-content',
}: {
  cachedOnly?: boolean
  titleClassName?: string
  bookmark: { url: string; title: string; icon?: string; json?: Record<string, unknown> }
}) {
  const fallback = useValue(settings$.previewImageSource)
  const source = previewSource(bookmark.json?.previewSource, fallback)
  const [preview, setPreview] = useState<BookmarkPreview>()
  const [failedImage, setFailedImage] = useState(false)
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    setPreview(undefined)
    setFailedImage(false)
    let key: string
    try {
      key = previewKey(bookmark.url, source)
    } catch {
      return
    }
    const load = () =>
      void (
        cachedOnly
          ? getCachedBookmarkPreview(bookmark.url, source)
          : loadBookmarkPreview(bookmark.url, source, false, { signal: controller.signal })
      ).then(
        (value) => {
          if (mounted) {
            setPreview(value)
            setFailedImage(false)
          }
        },
        () => {},
      )
    load()
    const unsubscribe = onPreviewChange((changedKey) => {
      if (changedKey === key) load()
    })
    return () => {
      mounted = false
      controller.abort()
      unsubscribe()
    }
  }, [bookmark.url, source, cachedOnly])
  let imageKey = ''
  try {
    imageKey = previewKey(bookmark.url, source)
  } catch {}
  let domain = bookmark.url
  try {
    domain = new URL(bookmark.url).hostname.replace(/^www\./, '')
  } catch {}
  return (
    <>
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row items-center gap-2">
          <Favicon iconUrl={bookmark.icon} pageUrl={bookmark.url} slotSize={18} iconSize={16} />
          <NoriText className="flex-1 text-xs text-content-muted" numberOfLines={1}>
            {domain}
          </NoriText>
        </View>
        <NoriText className={`text-sm font-medium ${titleClassName}`} numberOfLines={2}>
          {bookmark.title}
        </NoriText>
        {preview?.description ? (
          <NoriText className="text-xs text-content-muted" numberOfLines={2}>
            {preview.description}
          </NoriText>
        ) : null}
      </View>
      {preview?.imageUri && !failedImage ? (
        // The slot keeps its size, so a shorter image never changes the row height.
        <View style={{ width: IMAGE_WIDTH, height: IMAGE_HEIGHT, marginLeft: 8, justifyContent: 'center' }}>
          <Image
            source={{ uri: preview.imageUri }}
            style={{ width: IMAGE_WIDTH, height: imageHeight(imageKey), borderRadius: 12 }}
            contentFit="cover"
            transition={150}
            onLoad={({ source }) => {
              if (source.width > 0 && source.height > 0) {
                imageRatios.set(imageKey, source.width / source.height)
                redraw()
              }
            }}
            onError={() => setFailedImage(true)}
            accessible={false}
          />
        </View>
      ) : null}
    </>
  )
}
