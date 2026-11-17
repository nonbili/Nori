import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScreenshotBookmark } from './screenshot-sync'
import { SOCIAL_MEDIA_BUCKET, SOCIAL_ORPHAN_AGE_MS } from './social-post-store'

export { SOCIAL_ORPHAN_AGE_MS } from './social-post-store'
interface CloudPost { id: string; createdAt: number }
interface CloudMedia { path: string; postId?: string; createdAt: number }
export interface SocialCleanupStore {
  posts(): Promise<CloudPost[]>
  media(): Promise<CloudMedia[]>
  removePosts(ids: string[]): Promise<void>
  removeMedia(paths: string[]): Promise<void>
}

/** Run only after a full bookmark pull; keep tombstones and give offline devices seven days. */
export async function removeOrphanedSocialPosts(store: SocialCleanupStore, bookmarks: () => ScreenshotBookmark[] | Promise<ScreenshotBookmark[]>,
  isCurrent: () => boolean, now = Date.now()) {
  if (!isCurrent()) return
  const [posts, media] = await Promise.all([store.posts(), store.media()])
  const cutoff = now - SOCIAL_ORPHAN_AGE_MS
  const protectedIds = async () => new Set([
    ...(await bookmarks()).flatMap((bookmark) => {
      const ref = bookmark.json?.socialPost as { postId?: unknown } | undefined
      return typeof ref?.postId === 'string' ? [ref.postId] : []
    }),
    // Unknown dates and recent rows are protected even if an older media object is present.
    ...posts.filter((post) => !Number.isFinite(post.createdAt) || post.createdAt >= cutoff).map((post) => post.id),
  ])
  const batches = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / 100) }, (_, i) => items.slice(i * 100, (i + 1) * 100))
  for (const batch of batches(posts.filter((post) => post.createdAt < cutoff))) {
    if (!isCurrent()) return
    const keep = await protectedIds()
    if (!isCurrent()) return
    const ids = batch.filter((post) => !keep.has(post.id)).map((post) => post.id)
    if (ids.length) await store.removePosts(ids)
  }
  for (const batch of batches(media.filter((image) => image.createdAt < cutoff))) {
    if (!isCurrent()) return
    const keep = await protectedIds()
    if (!isCurrent()) return
    const paths = batch.filter((image) => !image.postId || !keep.has(image.postId)).map((image) => image.path)
    if (paths.length) await store.removeMedia(paths)
  }
}

export function createSocialCleanupStore(client: SupabaseClient, userId: string, isCurrent: () => boolean): SocialCleanupStore {
  const bucket = client.storage.from(SOCIAL_MEDIA_BUCKET)
  const table = client.schema('nori').from('saved_posts')
  const check = () => { if (!isCurrent()) throw new Error('social_account_changed') }
  const pageSize = 1000
  return {
    async posts() {
      const posts: CloudPost[] = []
      for (let offset = 0; ; offset += pageSize) {
        check()
        const { data, error } = await table.select('id, created_at').eq('user_id', userId).order('id').range(offset, offset + pageSize - 1)
        if (error) throw error
        posts.push(...(data || []).map((row) => ({ id: row.id as string, createdAt: Date.parse(row.created_at) })))
        if (!data || data.length < pageSize) return posts
      }
    },
    async media() {
      const media: CloudMedia[] = []
      for (let offset = 0; ; offset += pageSize) {
        check()
        const { data, error } = await bucket.list(userId, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } })
        if (error) throw error
        for (const file of data || []) media.push({ path: `${userId}/${file.name}`,
          postId: file.name.match(/^([0-9a-f-]{36})-\d+$/i)?.[1], createdAt: Date.parse(file.created_at || '') })
        if (!data || data.length < pageSize) return media
      }
    },
    async removePosts(ids) {
      check()
      const { error } = await table.delete().eq('user_id', userId).in('id', ids)
      if (error) throw error
    },
    async removeMedia(paths) {
      check()
      if (paths.some((path) => !path.startsWith(`${userId}/`) || path.slice(userId.length + 1).includes('/'))) throw new Error('invalid_saved_post_media')
      const { error } = await bucket.remove(paths)
      if (error) throw error
    },
  }
}
