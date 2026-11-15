import { fetchPage } from './bookmark'
import { readPreview, writePreview } from './bookmark-preview-storage'
import { fetchImage, notifyPreviewChange } from './bookmark-preview'
import { readSavedPostFrom, withSavedPostLock } from './social-post-sync'
import { fetchSocialPost, postAssets, socialAssetKey, socialKey, socialTarget, type SavedPost } from './social-post'

let onSaved: (() => void) | undefined
/** Called once a post is saved, for the host to sync it to the other devices. */
export function setSocialPostSaved(handler: typeof onSaved) {
  onSaved = handler
}
export function readSavedPost(url: string, owner: string) {
  return readSavedPostFrom(readPreview, url, owner)
}
export async function saveSocialPost(url: string, owner: string, current: () => boolean) {
  const target = socialTarget(url)
  if (!target) throw new Error('social_provider_not_supported')
  const post = await fetchSocialPost(target, async (endpoint, signal, format, headers) => {
    const response = await fetchPage(endpoint, { method: 'GET', signal, headers: { Accept: format === 'html' ? 'text/html' : 'application/json', ...headers } })
    if (!response.ok) throw new Error(`social_post_http_${response.status}`)
    // Native's buffered Response.json() uses its byte-per-character text()
    // implementation. Decode UTF-8 ourselves, as the OG parser does.
    const body = new TextDecoder().decode(await response.arrayBuffer())
    return format === 'html' ? body : JSON.parse(body)
  })
  const savedAt = Date.now()
  // Stage all bytes first. A failed image must not replace an existing archive.
  const images = await Promise.all(postAssets(post).map((item) => fetchImage(item.url)))
  const result: SavedPost = { post, savedAt, owner }
  const replaced = await withSavedPostLock(url, async () => {
    if (!current()) throw new Error('social_account_changed')
    // Another save of this URL finished first with a later snapshot: keep it.
    const latest = await readSavedPost(url, owner)
    if (latest && latest.savedAt >= savedAt) return false
    for (const [index, item] of postAssets(post).entries()) {
      item.cacheKey = socialAssetKey(url, index)
      await writePreview(item.cacheKey, { description: '', imageUrl: item.url, imageUri: images[index], savedAt, owner })
      if (!current()) throw new Error('social_account_changed')
    }
    await writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt, owner, savedPost: result })
    return true
  })
  if (!replaced) return (await readSavedPost(url, owner)) ?? result
  notifyPreviewChange(socialKey(url))
  onSaved?.()
  return result
}
