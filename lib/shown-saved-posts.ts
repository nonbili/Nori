import { peekPreview } from '@/lib/bookmark-preview-storage'
import { UNOWNED } from '@/lib/social-post-sync'
import { postAssets, socialKey, socialTarget, type SavedPost } from '@/lib/social-post'

// What each saved post tile and its images last showed, as `shownPreviews` keeps for page previews.
// A tile mounts with the post and its images at their final size instead of first showing the page
// preview, then the post with empty image slots, then each image as its file read returns.
// Capped, least recently stored first out. Well above what a screen or two of tiles shows, so only
// a tile far out of view can lose its entry, and then it reads from storage as it did before.
const MAX_POSTS = 1000
// A post carries up to its media, avatar, link thumbnails and quoted posts' images.
const MAX_IMAGES = 5000
const shownPosts = new Map<string, SavedPost | undefined>()
const shownImages = new Map<string, string>()

function remember<V>(map: Map<string, V>, max: number, key: string, value: V) {
  map.delete(key)
  map.set(key, value)
  if (map.size > max) map.delete(map.keys().next().value!)
}

export function shownSavedPost(url: string) {
  return shownPosts.get(url)
}
export function hasShownSavedPost(url: string) {
  return shownPosts.has(url)
}
export function rememberSavedPost(url: string, saved: SavedPost | undefined) {
  remember(shownPosts, MAX_POSTS, url, saved)
}
export function shownSavedImage(cacheKey: string) {
  return shownImages.get(cacheKey)
}
export function rememberSavedImage(cacheKey: string, uri: string) {
  remember(shownImages, MAX_IMAGES, cacheKey, uri)
}

/**
 * Reads the saved posts of these bookmarks and their images into the maps above for the startup
 * warm-up. Uses `peekPreview`, since `readPreview` first scans every record, which takes seconds
 * on a big library. Only `owner`'s or an unowned capture is taken, as `readSavedPost` does.
 */
export async function warmSavedPosts(urls: string[], owner: string) {
  await Promise.all(urls.filter((url) => socialTarget(url)).map(async (url) => {
    try {
      const saved = (await peekPreview(socialKey(url)))?.savedPost
      if (!saved || (saved.owner !== owner && saved.owner !== UNOWNED)) return
      await Promise.all(postAssets(saved.post).map(async (item) => {
        if (!item.cacheKey || shownImages.has(item.cacheKey)) return
        const image = await peekPreview(item.cacheKey).catch(() => undefined)
        if (image?.imageUri) rememberSavedImage(item.cacheKey, image.imageUri)
      }))
      // The post goes in once its images are known, so a tile never mounts with it but not them.
      rememberSavedPost(url, saved)
    } catch {}
  }))
}
