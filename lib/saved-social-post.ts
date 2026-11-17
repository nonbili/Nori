import { normalizeSocialImage } from './social-post-image'
import { fetchPage } from './bookmark'
import { previewImageData } from './preview-image'
import { readPreview, writePreview } from './bookmark-preview-storage'
import { fetchImage, notifyPreviewChange } from './bookmark-preview'
import { adoptSavedPost, readSavedPostFrom, UNOWNED, withSavedPostLock } from './social-post-sync'
import { fetchSocialPost, postAssets, socialAssetKey, socialKey, socialTarget, type SavedPost, type SocialPost } from './social-post'

let onSaved: (() => void) | undefined
/** Called once a post is saved, for the host to sync it to the other devices. */
export function setSocialPostSaved(handler: typeof onSaved) {
  onSaved = handler
}
/** The capture shown here: the account's own, or one saved on this device while signed out. */
export async function readSavedPost(url: string, owner: string) {
  return (await readSavedPostFrom(readPreview, url, owner)) ?? (await readSavedPostFrom(readPreview, url, UNOWNED))
}
export async function saveSocialPost(url: string, owner: string, current: () => boolean) {
  if (!current()) throw new Error('social_account_changed')
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
  return storeSocialPost(url, post, owner, current)
}

/** Saves a post read elsewhere, e.g. from its page in a WebView, the same way a fetched one is. */
export async function storeSocialPost(url: string, post: SocialPost, owner: string, current: () => boolean) {
  if (!current()) throw new Error('social_account_changed')
  const savedAt = Date.now()
  // Stage all bytes first. A failed image must not replace an existing archive.
  const images = await Promise.all(postAssets(post).map((item) => {
    const asset = new URL(item.url)
    if (post.site === 'facebook' && asset.hostname === 'lookaside.fbsbx.com' && asset.pathname === '/lookaside/crawler/media/')
      return fetchPage(item.url, { method: 'GET', headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      } }).then(previewImageData)
    return fetchImage(item.url)
  })).then((values) => values.map(normalizeSocialImage))
  const result: SavedPost = { post, savedAt, owner }
  const replaced = await withSavedPostLock(url, async () => {
    if (!current()) throw new Error('social_account_changed')
    // Another save of this URL finished first with a later snapshot: keep it.
    // Only this owner's own capture: one saved while signed out must not hold back a signed-in save.
    const latest = await readSavedPostFrom(readPreview, url, owner)
    if (latest && latest.savedAt >= savedAt) return false
    for (const [index, item] of postAssets(post).entries()) {
      item.cacheKey = socialAssetKey(url, index)
      await writePreview(item.cacheKey, { description: '', imageUrl: item.url, imageUri: images[index], savedAt, owner })
      if (!current()) throw new Error('social_account_changed')
    }
    await writePreview(socialKey(url), { description: '', imageUrl: '', imageUri: '', savedAt, owner, savedPost: result })
    return true
  })
  if (!replaced) return (await readSavedPostFrom(readPreview, url, owner)) ?? result
  notifyPreviewChange(socialKey(url))
  onSaved?.()
  return result
}

const localHost = { read: readPreview, write: writePreview, changed: notifyPreviewChange }

/** Explicitly merging device data gives its complete local captures to the chosen account. */
export async function adoptSavedPosts(urls: string[], owner: string, current: () => boolean) {
  for (const url of new Set(urls)) await adoptSavedPost({ ...localHost, isCurrent: current }, url, owner)
}

/**
 * Drops the captures here that are not `owner`'s, when the device's data hands over to that
 * account: a merge would adopt them, and one saved while signed out would be claimed by sync.
 */
export async function forgetSavedPosts(urls: string[], owner: string, current: () => boolean) {
  for (const url of new Set(urls)) await withSavedPostLock(url, async () => {
    const saved = (await readPreview(socialKey(url)))?.savedPost
    if (!saved || saved.owner === owner || !current()) return
    const blank = { description: '', imageUrl: '', imageUri: '', savedAt: 0 }
    for (const index of postAssets(saved.post).keys()) await writePreview(socialAssetKey(url, index), blank)
    await writePreview(socialKey(url), blank)
    notifyPreviewChange(socialKey(url))
  })
}
