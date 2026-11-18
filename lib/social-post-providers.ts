import * as cheerio from 'cheerio/slim'
import type { SocialMedia, SocialPost, SocialTarget } from './social-post'
import { normalizeRichText, type Entity, type EntityFeature, type RichText } from './sns-schema'
import { parseFacebookPost } from './social-post-facebook'

// These adapters require structured data for the exact permalink. OG tags are
// deliberately not a fallback: they lose galleries, quotes and full captions.
const unavailable = (): never => { throw new Error('social_post_unavailable') }
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 100_000) : ''
const url = (value: unknown) => {
  try {
    const parsed = new URL(text(value))
    return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''
  } catch { return '' }
}
const date = (value: unknown, seconds = false) => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const parsed = new Date(seconds ? Number(value) * 1000 : value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}
const avatar = (value: unknown): Pick<SocialPost, 'avatar'> => url(value) ? { avatar: { type: 'image', url: url(value) } } : {}
const images = (items: SocialMedia[]) => items.filter((item) => item.url).slice(0, 12)

// Syndication text is HTML-escaped; decode it like markup text without parsing tags.
const decodeHtml = (value: string) => value ? cheerio.load(value.replace(/</g, '&lt;')).root().text() : ''
interface XSpan { indices: unknown; plain?: string; shown?: string; feature?: EntityFeature }

/** Expands t.co links in the plain text and annotates links, mentions and tags the way X shows them. */
function xText(value: any): { plain: string; richText?: RichText } {
  const entities = value.entities || {}
  const list = (key: string): any[] => Array.isArray(entities[key]) ? entities[key] : []
  const spans: XSpan[] = [
    ...list('urls').map((item): XSpan => {
      const href = url(item.expanded_url)
      return { indices: item.indices, plain: text(item.expanded_url), shown: text(item.display_url) || text(item.expanded_url),
        feature: href ? { type: 'link', url: href } : undefined }
    }),
    // X hides the trailing t.co of attached media; the media itself is shown separately.
    ...list('media').map((item): XSpan => ({ indices: item.indices, plain: '', shown: '' })),
    ...list('user_mentions').filter((item) => text(item.screen_name)).map((item): XSpan => ({ indices: item.indices,
      feature: { type: 'mention', handle: text(item.screen_name), url: `https://x.com/${encodeURIComponent(text(item.screen_name))}` } })),
    ...list('hashtags').filter((item) => text(item.text)).map((item): XSpan => ({ indices: item.indices,
      feature: { type: 'hashtag', tag: text(item.text), url: `https://x.com/hashtag/${encodeURIComponent(text(item.text))}` } })),
    ...list('symbols').filter((item) => text(item.text)).map((item): XSpan => ({ indices: item.indices,
      feature: { type: 'cashtag', tag: text(item.text), url: `https://x.com/search?q=${encodeURIComponent(`$${text(item.text)}`)}` } })),
  ]
  // Syndication entity offsets count Unicode code points, not UTF-16 units.
  const body = Array.from(value.text as string)
  const ranged = spans.flatMap((span) => {
    const [start, end] = Array.isArray(span.indices) ? span.indices : []
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= body.length && end > start ? [{ ...span, start, end }] : []
  }).sort((a, b) => a.start - b.start)
  let cursor = 0
  let plain = ''
  let shown = ''
  const annotations: Entity[] = []
  for (const span of ranged) {
    if (span.start < cursor) continue
    const gap = decodeHtml(body.slice(cursor, span.start).join(''))
    const original = decodeHtml(body.slice(span.start, span.end).join(''))
    const display = span.shown ?? original
    plain += gap + (span.plain ?? original)
    shown += gap
    if (span.feature && display) annotations.push({ ...span.feature, start: shown.length, end: shown.length + display.length })
    shown += display
    cursor = span.end
  }
  const tail = decodeHtml(body.slice(cursor).join(''))
  plain = (plain + tail).trimEnd()
  shown = (shown + tail).trimEnd()
  const kept = annotations.filter((entity) => entity.end <= shown.length)
  return { plain, ...(kept.length ? { richText: normalizeRichText(shown, kept, 'utf16', 'drop') } : {}) }
}

export function parseXPost(value: any, depth = 0): SocialPost {
  const id = text(value?.id_str)
  const user = value?.user
  if (!/^\d+$/.test(id) || !user?.screen_name || typeof value.text !== 'string') return unavailable()
  const { plain, richText } = xText(value)
  const media = value.mediaDetails || value.extended_entities?.media || value.entities?.media || value.photos || []
  const nested = value.quoted_tweet || value.retweeted_status
  let quote: SocialPost | undefined
  if (depth < 2 && nested) { try { quote = parseXPost(nested, depth + 1) } catch {} }
  return {
    site: 'x', url: `https://x.com/${encodeURIComponent(user.screen_name)}/status/${id}`,
    author: text(user.name || user.screen_name), handle: text(user.screen_name),
    ...avatar(user.profile_image_url_https || user.profile_image_url),
    createdAt: date(value.created_at) || date(Number(BigInt(id) >> 22n) + 1288834974657),
    text: plain, ...(richText ? { richText } : {}),
    media: images(media.map((item: any): SocialMedia => ({
      type: item.type === 'video' || item.type === 'animated_gif' ? 'video' : 'image',
      url: url(item.media_url_https || item.url), alt: text(item.ext_alt_text),
      width: item.original_info?.width || item.width, height: item.original_info?.height || item.height,
    }))),
    ...(quote ? { nested: quote } : {}),
  }
}

// Search JSON documents, not markup or suggested-post OG previews. Bound traversal
// so a provider response cannot turn into an unbounded recursive walk.
function find(value: any, matches: (node: any) => boolean): any {
  const stack = [{ value, depth: 0 }]
  let count = 0
  while (stack.length && count++ < 50_000) {
    const node = stack.pop()!
    if (!node.value || typeof node.value !== 'object' || node.depth > 40) continue
    if (matches(node.value)) return node.value
    for (const child of Object.values(node.value)) stack.push({ value: child, depth: node.depth + 1 })
  }
}

function metaMedia(value: any): SocialMedia[] {
  if (value.media_type === 19) return []
  const gallery = value.carousel_media || value.edge_sidecar_to_children?.edges
  if ((value.__typename === 'GraphSidecar' || value.media_type === 8 || value.carousel_media !== undefined || value.edge_sidecar_to_children !== undefined) &&
    (!Array.isArray(gallery) || !gallery.length || (Number.isInteger(value.carousel_media_count) && value.carousel_media_count !== gallery.length))) return unavailable()
  const children = value.carousel_media || value.edge_sidecar_to_children?.edges?.map((edge: any) => edge.node) || [value]
  if (!Array.isArray(children)) return unavailable()
  // Do not save a partial gallery when the page omits an attachment's thumbnail.
  return images(children.map((item: any): SocialMedia => {
    const source = url(item.display_url || item.image_versions2?.candidates?.[0]?.url)
    if (!source && (item.is_video || item.media_type || children.length > 1)) return unavailable()
    return {
      type: item.is_video || item.media_type === 2 || item.video_versions?.length ? 'video' : 'image', url: source,
      alt: text(item.accessibility_caption), width: item.dimensions?.width || item.original_width,
      height: item.dimensions?.height || item.original_height,
    }
  }))
}

function metaPost(value: any, site: 'instagram' | 'threads', depth = 0): SocialPost {
  const code = text(value?.shortcode || value?.code)
  const user = value?.owner || value?.user
  if (!code || !user?.username) return unavailable()
  const caption = value.edge_media_to_caption?.edges?.[0]?.node?.text ?? value.caption?.text ?? ''
  const share = value.text_post_app_info?.share_info
  const nested = share?.quoted_post || share?.reposted_post
  let quote: SocialPost | undefined
  if (depth < 2 && nested) { try { quote = metaPost(nested, site, depth + 1) } catch {} }
  // Embed responses can omit taken_at; Instagram's media ID encodes the
  // original creation time above its low 23 bits (also used by Nora Feed).
  let createdAt = date(value.taken_at_timestamp ?? value.taken_at, true)
  if (!createdAt && /^\d+$/.test(String(value.id || value.pk || ''))) {
    createdAt = date(Number(BigInt(value.id || value.pk) >> 23n) + 1314220021721)
  }
  return {
    site, url: site === 'threads' ? `https://www.threads.com/@${encodeURIComponent(user.username)}/post/${code}` : `https://www.instagram.com/p/${code}/`,
    author: text(user.full_name || user.username), handle: text(user.username), ...avatar(user.profile_pic_url),
    createdAt, text: text(caption),
    media: metaMedia(value), ...(quote ? { nested: quote } : {}),
  }
}

function tiktokPost(value: any): SocialPost {
  const user = value?.author
  if (!user?.uniqueId || !value?.id || value.isAd) return unavailable()
  const photos = value.imagePost?.images
  const media: SocialMedia[] = Array.isArray(photos) && photos.length ? photos.map((item: any) => ({
    type: 'image', url: url(item.imageURL?.urlList?.[0]), width: item.imageWidth, height: item.imageHeight,
  })) : [{ type: 'video', url: url(value.video?.cover || value.video?.originCover), width: value.video?.width, height: value.video?.height }]
  if (media.some((item) => !item.url)) return unavailable()
  return {
    site: 'tiktok', url: `https://www.tiktok.com/@${encodeURIComponent(user.uniqueId)}/${photos?.length ? 'photo' : 'video'}/${value.id}`,
    author: text(user.nickname || user.uniqueId), handle: text(user.uniqueId), ...avatar(user.avatarLarger || user.avatarMedium || user.avatarThumb),
    createdAt: date(value.createTime, true), text: text(value.desc).replace(/[\u2028\u2029]/g, '\n'), media: images(media),
  }
}

/** The JSON documents a page embeds in its scripts. */
export function pageDocuments(html: string): any[] {
  if (typeof html !== 'string' || html.length > 20 * 1024 * 1024) return []
  const $ = cheerio.load(html)
  const documents: any[] = []
  $('script').each((_, element) => {
    const body = $(element).text()
    try { documents.push(JSON.parse(body)) } catch {}
    // Instagram embeds wrap their JSON in a JS string, not a JSON script.
    const context = body.match(/\bcontextJSON"?\s*:\s*("(?:[^"\\]|\\.)*")/)
    if (context) { try { documents.push(JSON.parse(JSON.parse(context[1]))) } catch {} }
  })
  return documents
}

export function parsePageSocialPost(html: string, target: SocialTarget): SocialPost {
  return parseSocialDocuments(pageDocuments(html), target)
}

/** Finds the exact target post in JSON from a page or its API responses, whatever their wrapping. */
export function parseSocialDocuments(documents: any[], target: SocialTarget): SocialPost {
  if (target.site === 'facebook') return parseFacebookPost(documents, target) || unavailable()
  for (const document of documents) {
    const value = find(document, (node) => {
      if (target.site === 'tiktok') return String(node.id) === target.id && node.author?.uniqueId && typeof node.desc === 'string'
      return (node.shortcode || node.code) === target.id && (node.owner?.username || node.user?.username) &&
        (node.caption !== undefined || node.edge_media_to_caption || node.image_versions2 || node.display_url || node.text_post_app_info)
    })
    if (value) {
      if (target.site === 'tiktok') {
        // A photo page can expose metadata plus a video cover but omit the
        // gallery. Never accept that as a complete photo archive, including
        // when parsing the fallback video representation of the same post.
        if (new URL(target.url).pathname.includes('/photo/') && !value.imagePost?.images?.length) return unavailable()
        return tiktokPost(value)
      }
      return metaPost(value, target.site === 'instagram' ? 'instagram' : 'threads')
    }
  }
  return unavailable()
}
