import { fetchWithTimeout } from './fetch-with-timeout'
import { bytesToBase64 } from './screenshot-sync'
import { decodeStoredPostResponse, validAssetId, type Asset, type Post, type PostResponse } from './sns-schema'
import type { SharedSocialPost } from './social-post-sync'
import type { SocialMedia, SocialPost } from './social-post'

export class SocialPostHttpError extends Error {
  constructor(readonly status: number) { super(`social_sync_http_${status}`) }
}
/** User sessions stay in the Authorization header; no server API key ships with Nori. */
export function createNgSocialClient(origin: string, accessToken: () => Promise<string>) {
  const base = new URL(origin)
  if (base.username || base.password) throw new Error('NG origin must not contain credentials')
  if (base.search || base.hash) throw new Error('NG API base must not contain a query or fragment')
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
    throw new Error('NG requires HTTPS')
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
  const apiUrl = (path: string) => new URL(path.replace(/^\/+/, ''), base).href
  const asset = (value: Asset, postId: string, type: SocialMedia['type'] = 'image'): SocialMedia => ({
    type, assetId: value.id, postId,
    url: apiUrl(`/v1/sns/posts/${postId}/assets/${value.id}`),
  })
  // This is a view model for the existing local provider saves. The entire canonical post is
  // retained separately, so display choices never discard entities, metadata or relationships.
  const post = (value: Post, postId: string): SocialPost => ({
    site: value.identity.provider, url: value.url, author: value.author.displayName, handle: value.author.handle,
    text: value.content.text, richText: value.content, title: value.title, contentWarning: value.contentWarning, sensitive: value.sensitive,
    ...(value.createdAt ? { createdAt: value.createdAt } : {}),
    ...(value.author.avatar ? { avatar: asset(value.author.avatar, postId) } : {}),
    media: value.media.flatMap((item): SocialMedia[] => {
      const image = item.type === 'image' ? item.image : item.type === 'video' ? item.thumbnail : item.artwork
      if (!image) return [] // An audio preview without artwork remains in the canonical post.
      return [{ ...asset(image, postId, item.type),
        ...(item.type !== 'audio' ? { alt: item.alt, width: item.width, height: item.height } : { alt: item.title }) }]
    }),
    links: value.links.map(({ thumbnail, ...link }) => ({ ...link, ...(thumbnail ? { thumbnail: asset(thumbnail, postId) } : {}) })),
    relations: value.relations.map((relation) => relation.state === 'available'
      ? { ...relation, post: post(relation.post, postId) } : { ...relation }),
  })
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetchWithTimeout(apiUrl(path), {
      ...init, redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` },
    }, 180_000)
    if (!response.ok) throw new SocialPostHttpError(response.status)
    return response
  }
  const readPost = async (path: string, init?: RequestInit): Promise<SharedSocialPost> => {
    const value = decodeStoredPostResponse(JSON.parse(new TextDecoder().decode(await (await request(path, init)).arrayBuffer())))
    const normalized: PostResponse = { version: value.version, fetchedAt: value.fetchedAt, post: value.post }
    return { postId: value.postId, fetchedAt: value.fetchedAt, post: post(value.post, value.postId), remote: normalized }
  }
  return {
    save: (url: string) => readPost('/v1/sns/saves', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    }),
    get: (id: string) => {
      if (!validAssetId(id)) throw new Error('invalid_social_post')
      return readPost(`/v1/sns/posts/${id}`)
    },
    image: async (image: SocialMedia) => {
      if (!validAssetId(image.assetId)) throw new Error('invalid_social_asset')
      if (!validAssetId(image.postId)) throw new Error('invalid_social_post')
      const response = await request(`/v1/sns/posts/${image.postId}/assets/${image.assetId}`)
      const contentType = response.headers.get('content-type')
      if (!contentType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(contentType))
        throw new Error('invalid_social_image')
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 20 * 1024 * 1024) throw new Error('social_image_too_large')
      return `data:${contentType};base64,${bytesToBase64(bytes)}`
    },
  }
}
