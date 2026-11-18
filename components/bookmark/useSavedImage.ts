import { useEffect, useState } from 'react'
import { readPreview } from '@/lib/bookmark-preview-storage'
import { rememberSavedImage, shownSavedImage } from '@/lib/shown-saved-posts'
import type { SocialMedia } from '@/lib/social-post'

/** The locally saved copy of a post's image, or '' once the read finds none. */
export function useSavedImage(item?: SocialMedia) {
  const key = item?.cacheKey
  // Starts from what was last shown, so a remounted or warmed-up image does not flash in.
  const [image, setImage] = useState<{ key: string; uri: string } | undefined>(() => {
    const uri = key ? shownSavedImage(key) : undefined
    return key && uri !== undefined ? { key, uri } : undefined
  })
  useEffect(() => {
    let active = true
    if (key) void readPreview(key).then((value) => {
      const uri = value?.imageUri || ''
      rememberSavedImage(key, uri)
      if (active) setImage((current) => current?.key === key && current.uri === uri ? current : { key, uri })
    }).catch(() => {})
    return () => { active = false }
  }, [key])
  if (image?.key === key) return image?.uri
  return key ? shownSavedImage(key) : undefined
}
