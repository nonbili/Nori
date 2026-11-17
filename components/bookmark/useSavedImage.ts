import { useEffect, useState } from 'react'
import { readPreview } from '@/lib/bookmark-preview-storage'
import type { SocialMedia } from '@/lib/social-post'

/** The locally saved copy of a post's image, or '' once the read finds none. */
export function useSavedImage(item?: SocialMedia) {
  const [image, setImage] = useState<{ key: string; uri: string }>()
  useEffect(() => {
    let active = true
    const key = item?.cacheKey
    if (key) void readPreview(key).then((value) => {
      if (active) setImage({ key, uri: value?.imageUri || '' })
    }).catch(() => {})
    return () => { active = false }
  }, [item?.cacheKey])
  return image?.key === item?.cacheKey ? image?.uri : undefined
}
