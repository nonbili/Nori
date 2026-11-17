import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSocialImage } from './social-post-image-core'
import { base64ToBytes } from './screenshot-sync'
import { MAX_POST_ASSETS, postAssets, validSocialPost, type SocialPost } from './social-post'

export const SOCIAL_MEDIA_BUCKET = 'nori-sns-media'
export const SAVED_POST_VERSION = 1
export const SOCIAL_ORPHAN_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const validSaveId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
export interface PrivateSocialPost { id: string; version: number; capturedAt: number; createdAt?: number; post: SocialPost }
export class SavedPostNotFoundError extends Error {
  constructor() { super('saved_post_not_found') }
}
export interface SocialPostStore {
  save(value: PrivateSocialPost, images: string[]): Promise<void>
  get(id: string): Promise<PrivateSocialPost>
  image(id: string, index: number): Promise<string>
}

// All assets use flat, immutable paths so account deletion can enumerate the whole folder.
export const socialMediaPath = (userId: string, id: string, index: number) => `${userId}/${id}-${index}`

export function decodePrivatePost(row: { id: string; version: number; captured_at: string; created_at?: string; data: unknown }): PrivateSocialPost {
  if (!validSaveId(row.id) || row.version !== SAVED_POST_VERSION || !Number.isFinite(Date.parse(row.captured_at)) ||
    !validSocialPost(row.data) || postAssets(row.data).length > MAX_POST_ASSETS) throw new Error('invalid_saved_post')
  // Local cache paths and former NG asset IDs are never authoritative on another device.
  const post = cleanPost(row.data)
  const createdAt = row.created_at === undefined ? undefined : Date.parse(row.created_at)
  if (createdAt !== undefined && !Number.isFinite(createdAt)) throw new Error('invalid_saved_post')
  return { id: row.id, version: row.version, capturedAt: Date.parse(row.captured_at), createdAt, post }
}
export function cleanPost(value: SocialPost): SocialPost {
  const post = structuredClone(value)
  for (const asset of postAssets(post)) {
    delete asset.cacheKey
    delete asset.assetId
    delete asset.postId
  }
  return post
}

export function createSocialPostStore(client: SupabaseClient, userId: string, isCurrent: () => boolean,
  fetchImage: (url: string) => Promise<string>): SocialPostStore {
  const table = client.schema('nori').from('saved_posts')
  const bucket = client.storage.from(SOCIAL_MEDIA_BUCKET)
  const check = () => { if (!isCurrent()) throw new Error('social_account_changed') }
  const path = (id: string, index: number) => {
    if (!validSaveId(id) || !Number.isInteger(index) || index < 0 || index >= MAX_POST_ASSETS) throw new Error('invalid_saved_post')
    return socialMediaPath(userId, id, index)
  }
  return {
    async save(value, images) {
      check()
      const decoded = decodePrivatePost({ id: value.id, version: value.version, captured_at: new Date(value.capturedAt).toISOString(), data: value.post })
      if (postAssets(decoded.post).length !== images.length) throw new Error('missing_saved_post_media')
      // Validate all bytes before starting uploads; never fetch upstream URLs during sync.
      const files = images.map((image) => {
        const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,(.*)$/.exec(normalizeSocialImage(image))
        if (!match) throw new Error('invalid_saved_post_media')
        const bytes = base64ToBytes(match[2])
        if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('invalid_saved_post_media')
        return { bytes, contentType: match[1] }
      })
      const uploaded: string[] = []
      try {
        for (const [index, file] of files.entries()) {
          check()
          const destination = path(value.id, index)
          const { error } = await bucket.upload(destination, file.bytes, { contentType: file.contentType, upsert: false })
          if (error) throw error
          uploaded.push(destination)
        }
        check()
        const { error } = await table.insert({ id: value.id, user_id: userId, version: value.version,
          captured_at: new Date(value.capturedAt).toISOString(), data: decoded.post })
        if (error) throw error
      } catch (error) {
        // An unpublished capture is safe to retry with a new ID. Never clean up under a new account.
        if (isCurrent() && uploaded.length) await bucket.remove(uploaded).catch(() => {})
        throw error
      }
    },
    async get(id) {
      check()
      if (!validSaveId(id)) throw new Error('invalid_saved_post')
      const { data, error } = await table.select('id, version, captured_at, created_at, data').eq('id', id).eq('user_id', userId).maybeSingle()
      if (error) throw error
      check()
      if (!data) throw new SavedPostNotFoundError()
      return decodePrivatePost(data)
    },
    async image(id, index) {
      check()
      const { data, error } = await bucket.createSignedUrl(path(id, index), 60)
      if (error || !data) throw error ?? new Error('saved_post_media_not_found')
      check()
      const image = await fetchImage(data.signedUrl)
      check()
      return image
    },
  }
}
