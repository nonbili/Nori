import * as cheerio from 'cheerio/slim'
import { parsePageSocialPost, parseXPost } from './social-post-providers'
import { SNS_LIMITS, validRichText, type Identity, type PostResponse, type RelationType, type RichText } from './sns-schema'

// Matches Nora Feed's provider vocabulary. Providers are added independently;
// an unsupported permalink must never be presented as an archived OG card.
export type SocialSite = string
export interface SocialMedia {
  type: 'image' | 'video' | 'audio'
  url: string // An image, or a video's thumbnail. Never a video file.
  alt?: string
  width?: number
  height?: number
  cacheKey?: string
  /** Shared NG asset identity. Never a client upload destination. */
  assetId?: string
  /** Post granting access to this asset on NG. */
  postId?: string
}
export interface SocialRelation {
  type: RelationType
  target: Identity
  state: 'reference' | 'unavailable' | 'available'
  reason?: string
  post?: SocialPost
}
export interface SocialLink { url: string; title: string; description: string; thumbnail?: SocialMedia }
export interface SocialPost {
  site: SocialSite
  url: string
  author: string
  handle?: string
  avatar?: SocialMedia
  createdAt?: string
  text: string
  richText?: RichText
  title?: RichText
  contentWarning?: RichText
  sensitive?: boolean
  links?: SocialLink[]
  relations?: SocialRelation[]
  media: SocialMedia[]
  nested?: SocialPost
}
export interface SavedPost {
  /** Complete normalized data, retained independently of the display adapter. */
  remote?: PostResponse
  post: SocialPost
  savedAt: number
  owner: string
  fetchedAt?: string
  postId?: string
}
export interface SocialTarget { site: 'bluesky' | 'mastodon' | 'reddit' | 'x' | 'instagram' | 'threads' | 'tiktok'; url: string; id: string; actor?: string }

const MAX_MEDIA = 12
const MAX_DEPTH = 2
/** Media plus an avatar, for the post and each nested level. */
export const MAX_POST_ASSETS = SNS_LIMITS.assets
/** Preview storage keys: the post itself, and each of its archived images. */
export const socialKey = (url: string) => `social:${new URL(url).href}`
export const socialAssetKey = (url: string, index: number) => `${socialKey(url)}:${index}`

export function socialTarget(value: string): SocialTarget | undefined {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return
    const host = url.hostname.replace(/^www\./, '')
    let match: RegExpMatchArray | null
    if (['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host) &&
      (match = url.pathname.match(/^\/(?:[^/]+|i\/web)\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?\/?$/)))
      return { site: 'x', url: url.href, id: match[1] }
    if (host === 'instagram.com' && (match = url.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)\/?$/)))
      return { site: 'instagram', url: url.href, id: match[1] }
    if (['threads.com', 'threads.net'].includes(host) && (match = url.pathname.match(/^\/@([^/]+)\/post\/([\w-]+)\/?$/)))
      return { site: 'threads', url: url.href, actor: match[1], id: match[2] }
    if (host === 'tiktok.com' && (match = url.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/(\d+)\/?$/)))
      return { site: 'tiktok', url: url.href, actor: match[1], id: match[2] }
    if (host === 'bsky.app' && (match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/)))
      return { site: 'bluesky', url: url.href, actor: decodeURIComponent(match[1]), id: match[2] }
    if (['reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com'].includes(host) &&
      (match = url.pathname.match(/^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/|$)/i)))
      return { site: 'reddit', url: url.href, id: match[1] }
    if (host === 'redd.it' && (match = url.pathname.match(/^\/([a-z0-9]+)\/?$/i)))
      return { site: 'reddit', url: url.href, id: match[1] }
    if ((match = url.pathname.match(/^\/@[^/]+\/(\d+)\/?$/)) ||
      (match = url.pathname.match(/^\/users\/[^/]+\/statuses\/(\d+)\/?$/)))
      return { site: 'mastodon', url: url.href, id: match[1] }
  } catch {}
}

const webUrl = (value: unknown): string => {
  try {
    const url = new URL(typeof value === 'string' ? value : '')
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 50000) : ''
const htmlText = (value: unknown) => {
  const $ = cheerio.load(text(value).replace(/<br\s*\/?\s*>|<\/p>/gi, '\n'))
  $('script,style').remove()
  return $.root().text().trim()
}
// A quoted or crossposted post that was deleted or is private must not stop the outer one saving.
const nestedPost = (depth: number, value: unknown, parse: (value: any, depth: number) => SocialPost) => {
  if (depth >= MAX_DEPTH || !value) return {}
  try { return { nested: parse(value, depth + 1) } } catch { return {} }
}
const media = (items: SocialMedia[]) => items.filter((item) => item.url).slice(0, MAX_MEDIA)

// The API views contain their quoted records recursively. Keep a bounded tree,
// rather than following arbitrary links or downloading an entire conversation.
export function parseBlueskyPost(value: any, depth = 0): SocialPost {
  const parts = text(value?.uri).match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/)
  if (!parts) throw new Error('social_post_unavailable')
  const embed = value.embed || value.embeds?.[0]
  const own = embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.media : embed
  const quoted = embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.record?.record : embed?.record
  const images: SocialMedia[] = own?.$type === 'app.bsky.embed.images#view'
    ? (own.images || []).map((item: any) => ({ type: 'image', url: webUrl(item.fullsize), alt: text(item.alt), width: item.aspectRatio?.width, height: item.aspectRatio?.height }))
    : own?.$type === 'app.bsky.embed.video#view'
      ? [{ type: 'video', url: webUrl(own.thumbnail) }]
      : []
  return {
    site: 'bluesky',
    url: `https://bsky.app/profile/${value.author?.handle || parts[1]}/post/${parts[2]}`,
    author: text(value.author?.displayName || value.author?.handle || parts[1]),
    handle: text(value.author?.handle || parts[1]),
    ...(webUrl(value.author?.avatar) ? { avatar: { type: 'image', url: webUrl(value.author.avatar) } } : {}),
    createdAt: postDate(value.record?.createdAt || value.value?.createdAt || value.indexedAt),
    text: text(value.record?.text ?? value.value?.text),
    media: media(images),
    ...nestedPost(depth, quoted?.$type === 'app.bsky.embed.record#viewRecord' && quoted, parseBlueskyPost),
  }
}

export function parseMastodonPost(value: any, depth = 0): SocialPost {
  if (!value?.id || !webUrl(value.url || value.uri)) throw new Error('social_post_unavailable')
  // Mastodon's quote is `{ state, quoted_status }`, null while unavailable; some forks inline the status.
  const nested = value.reblog || value.quote?.quoted_status || (value.quote?.url ? value.quote : undefined)
  return {
    site: 'mastodon', url: webUrl(value.url || value.uri),
    author: text(value.account?.display_name || value.account?.acct),
    handle: text(value.account?.acct),
    ...(webUrl(value.account?.avatar_static || value.account?.avatar) ? { avatar: { type: 'image', url: webUrl(value.account.avatar_static || value.account.avatar) } } : {}),
    createdAt: postDate(value.created_at),
    text: [text(value.spoiler_text), htmlText(value.content)].filter(Boolean).join('\n\n'),
    media: media((value.media_attachments || []).flatMap((item: any): SocialMedia[] => {
      if (item.type === 'image') return [{ type: 'image', url: webUrl(item.url || item.remote_url), alt: text(item.description) }]
      if (item.type === 'video' || item.type === 'gifv') return [{ type: 'video', url: webUrl(item.preview_url), alt: text(item.description) }]
      return []
    })),
    ...nestedPost(depth, nested, parseMastodonPost),
  }
}

export function parseRedditPost(value: any, depth = 0): SocialPost {
  if (!value?.id || !value.permalink) throw new Error('social_post_unavailable')
  const decode = (value: unknown) => text(value).replace(/&amp;/g, '&')
  const images: SocialMedia[] = []
  if (value.is_video || value.media?.reddit_video || value.preview?.reddit_video_preview) {
    images.push({ type: 'video', url: webUrl(decode(value.preview?.images?.[0]?.source?.url || value.thumbnail)) })
  } else if (value.gallery_data?.items) {
    for (const item of value.gallery_data.items) {
      const image = value.media_metadata?.[item.media_id]
      images.push({ type: image?.e === 'AnimatedImage' ? 'video' : 'image', url: webUrl(decode(image?.s?.u || image?.p?.at(-1)?.u)) })
    }
  } else if (value.post_hint === 'image' || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(value.url || '')) {
    images.push({ type: 'image', url: webUrl(decode(value.url)) })
  }
  return {
    site: 'reddit', url: new URL(value.permalink, 'https://www.reddit.com').href,
    author: text(value.author), text: [text(value.title), text(value.selftext)].filter(Boolean).join('\n\n'),
    handle: `u/${text(value.author)}`,
    createdAt: typeof value.created_utc === 'number' ? postDate(value.created_utc * 1000) : undefined,
    media: media(images),
    ...nestedPost(depth, value.crosspost_parent_list?.[0], parseRedditPost),
  }
}

// HTML providers use the same host transport as JSON APIs (including desktop's Go fetch).
type JsonFetch = (url: string, signal?: AbortSignal, format?: 'html', headers?: Record<string, string>) => Promise<any>
export async function fetchSocialPost(target: SocialTarget, get: JsonFetch, signal?: AbortSignal): Promise<SocialPost> {
  if (target.site === 'x') {
    const json = await get(`https://cdn.syndication.twimg.com/tweet-result?id=${target.id}&lang=en&token=${((Number(target.id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')}`, signal)
    if (String(json?.id_str) !== target.id) throw new Error('social_post_unavailable')
    return parseXPost(json)
  }
  if (target.site === 'instagram' || target.site === 'threads' || target.site === 'tiktok') {
    if (target.site === 'tiktok' && new URL(target.url).pathname.includes('/photo/')) {
      try {
        return parsePageSocialPost(await get(`https://www.tiktok.com/@${target.actor}/photo/${target.id}`, signal, 'html'), target)
      } catch (error) {
        if (signal?.aborted) throw error
        // Some public photo pages omit imagePost; Nora also uses the video
        // representation to retrieve the complete gallery for these posts.
      }
    }
    const endpoint = target.site === 'instagram' ? `https://www.instagram.com/p/${target.id}/embed/captioned/`
      : target.site === 'threads' ? `https://www.threads.com/@${target.actor}/post/${target.id}`
        : `https://www.tiktok.com/@${target.actor}/video/${target.id}`
    // Threads sends only an app shell to ordinary HTTP clients; its public
    // crawler representation includes the structured permalink data.
    const headers = target.site === 'threads' ? { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } : undefined
    return parsePageSocialPost(await get(endpoint, signal, 'html', headers), target)
  }
  if (target.site === 'bluesky') {
    let actor = target.actor || ''
    if (!actor.startsWith('did:')) {
      const resolved = await get(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`, signal)
      if (!/^did:[a-z]+:[\w.:%-]+$/.test(resolved?.did || '')) throw new Error('social_post_unavailable')
      actor = resolved.did
    }
    const uri = `at://${actor}/app.bsky.feed.post/${target.id}`
    const json = await get(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`, signal)
    return parseBlueskyPost(json?.thread?.post)
  }
  if (target.site === 'reddit') {
    const json = await get(`https://www.reddit.com/comments/${target.id}.json?raw_json=1&limit=1`, signal)
    return parseRedditPost(json?.[0]?.data?.children?.[0]?.data)
  }
  return parseMastodonPost(await get(`${new URL(target.url).origin}/api/v1/statuses/${target.id}`, signal))
}

export function postMedia(post: SocialPost): SocialMedia[] {
  return [...post.media, ...(post.nested ? postMedia(post.nested) : []),
    ...(post.relations || []).flatMap((relation) => relation.post ? postMedia(relation.post) : [])]
}

function postDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

/** Avatars are archived too, so a saved post never needs the network to render. */
export function postAssets(post: SocialPost): SocialMedia[] {
  return [...post.media, ...(post.avatar ? [post.avatar] : []),
    ...(post.links || []).flatMap((link) => link.thumbnail ? [link.thumbnail] : []),
    ...(post.nested ? postAssets(post.nested) : []),
    ...(post.relations || []).flatMap((relation) => relation.post ? postAssets(relation.post) : [])]
}

/** Treat cloud objects as untrusted input, including recursion and local paths. */
export function validSocialPost(value: unknown, depth = 0): value is SocialPost {
  if (!value || typeof value !== 'object' || depth > SNS_LIMITS.depth) return false
  const post = value as SocialPost
  return typeof post.site === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(post.site) && Boolean(webUrl(post.url)) &&
    typeof post.author === 'string' && post.author.length <= 50000 &&
    (post.handle === undefined || typeof post.handle === 'string') &&
    (post.createdAt === undefined || (typeof post.createdAt === 'string' && Boolean(postDate(post.createdAt)))) &&
    (post.avatar === undefined || (post.avatar?.type === 'image' && Boolean(webUrl(post.avatar.url)))) &&
    typeof post.text === 'string' && post.text.length <= 100000 &&
    Array.isArray(post.media) && post.media.length <= MAX_MEDIA && post.media.every((item) =>
      item && (item.type === 'image' || item.type === 'video' || item.type === 'audio') && Boolean(webUrl(item.url)) &&
      (item.alt === undefined || typeof item.alt === 'string')) &&
    (post.richText === undefined || validRichText(post.richText)) &&
    (post.title === undefined || validRichText(post.title)) &&
    (post.sensitive === undefined || typeof post.sensitive === 'boolean') &&
    (post.contentWarning === undefined || validRichText(post.contentWarning)) &&
    (post.links === undefined || (Array.isArray(post.links) && post.links.length <= SNS_LIMITS.links && post.links.every((link) =>
      Boolean(webUrl(link.url)) && typeof link.title === 'string' && typeof link.description === 'string' &&
      (!link.thumbnail || Boolean(webUrl(link.thumbnail.url)))))) &&
    (post.relations === undefined || (Array.isArray(post.relations) && post.relations.length <= SNS_LIMITS.relations && post.relations.every((relation) =>
      ['reference', 'unavailable', 'available'].includes(relation.state) && (!relation.post || validSocialPost(relation.post, depth + 1))))) &&
    (post.nested === undefined || validSocialPost(post.nested, depth + 1))
}
