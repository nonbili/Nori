import { useEffect, useReducer, useState } from 'react'
import { Image } from 'expo-image'
import { Platform, View } from 'react-native'
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

// The image runs to the tile's top, right and bottom edges, so its slot takes in the p-4 the text
// column keeps: 1rem a side, which is 16 on web but 14 under NativeWind on native.
const TILE_PADDING = Platform.OS === 'web' ? 16 : 14
const IMAGE_WIDTH = 104 + 2 * TILE_PADDING
const IMAGE_HEIGHT = 80 + 2 * TILE_PADDING
// Wide page images (GitHub cards, banners) are shown whole up to 2:1 rather than cropped to the slot.
const IMAGE_MIN_HEIGHT = IMAGE_WIDTH / 2
// Remembered across mounts, so a recycled row sizes its image before it loads again. Keyed by
// preview key, not image uri: web and desktop uris are data urls holding the whole image.
const imageRatios = new Map<string, number>()

// Undefined when the image is tall enough to fill the slot, however tall the text makes the tile.
function wideImageHeight(key: string) {
  const ratio = imageRatios.get(key)
  const height = ratio ? Math.max(IMAGE_MIN_HEIGHT, IMAGE_WIDTH / ratio) : IMAGE_HEIGHT
  return height < IMAGE_HEIGHT ? height : undefined
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
  const wideHeight = wideImageHeight(imageKey)
  return (
    <>
      <View className="min-w-0 flex-1 justify-center gap-2 p-4">
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
        // The slot keeps its size, so a shorter image never changes the row height. The tile clips
        // the corners of an image that fills it; a shorter one rounds its own free corners.
        <View style={{ width: IMAGE_WIDTH, minHeight: IMAGE_HEIGHT, alignSelf: 'stretch', justifyContent: 'center' }}>
          <Image
            source={{ uri: preview.imageUri }}
            style={
              wideHeight
                ? { width: IMAGE_WIDTH, height: wideHeight, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }
                : { width: IMAGE_WIDTH, flex: 1 }
            }
            contentFit="cover"
            transition={150}
            onLoad={({ source }) => {
              if (source.width > 0 && source.height > 0) {
                // The size reported is the bitmap decoded for this view, so it is off by a
                // rounded pixel from one load to the next. Following that would resize the
                // image, which loads it again at the new size, without end.
                const ratio = source.width / source.height
                const known = imageRatios.get(imageKey)
                if (!known || Math.abs(ratio - known) / known > 0.02) {
                  imageRatios.set(imageKey, ratio)
                  redraw()
                }
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
