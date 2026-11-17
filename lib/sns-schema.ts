/** Nori SNS rich-text and normalized post types. Version independently from retrieval services. */
export const POST_SCHEMA_VERSION = 1 as const
export const SNS_LIMITS = { depth: 5, posts: 16, assets: 64, media: 12, links: 8, relations: 8, text: 100_000, entities: 256 } as const
export type Provider = string
/** IDs are opaque. Instance-local IDs must include their origin; handles are never identity keys. */
export interface Identity { provider: Provider; id: string; origin?: string }
export interface Asset { id: string; url: string; contentType: string; byteLength: number }
export type EntityFeature =
  | { type: 'link'; url: string; displayText?: string }
  | { type: 'mention'; identity?: Identity; handle?: string; url?: string }
  | { type: 'hashtag' | 'cashtag'; tag: string; url?: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'blockquote' | 'spoiler' }
  | { type: 'pre'; language?: string }
  | { type: 'emoji'; id: string; name?: string }
  | { type: 'extension'; name: string; data?: JsonValue }
/** Half-open ranges in the exact stored text. Overlapping/nested entities are allowed. */
export type Entity = EntityFeature & { start: number; end: number }
export interface RichText { text: string; offsetEncoding: 'utf16'; entities: Entity[] }
export type OffsetEncoding = 'utf8' | 'utf16' | 'codepoint'
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
interface Dimensions { alt?: string; width?: number; height?: number }
/** Video/audio are explicitly previews; playable media requires a future capability, not an upstream URL. */
export type Media =
  | (Dimensions & { type: 'image'; image: Asset })
  | (Dimensions & { type: 'video'; thumbnail: Asset; availability: 'preview'; durationMs?: number })
  | { type: 'audio'; artwork?: Asset; availability: 'preview'; title?: string; durationMs?: number }
export interface LinkCard { url: string; title: string; description: string; thumbnail?: Asset }
export type RelationType = 'reply' | 'reply-root' | 'quote' | 'repost' | 'crosspost'
export type PostRelation = { type: RelationType; target: Identity } & (
  | { state: 'reference' }
  | { state: 'unavailable'; reason: string }
  | { state: 'available'; post: Post }
)
export interface Post {
  identity: Identity
  url: string
  author: { identity: Identity; displayName: string; handle?: string; url?: string; avatar?: Asset }
  content: RichText
  title?: RichText
  contentWarning?: RichText
  createdAt?: string
  editedAt?: string
  language?: string
  sensitive?: boolean
  media: Media[]
  links: LinkCard[]
  relations: PostRelation[]
  /** Bounded namespaced metadata, never instructions to fetch/render provider HTML. */
  extensions?: Record<string, JsonValue>
}
export interface PostResponse { version: typeof POST_SCHEMA_VERSION; fetchedAt: string; post: Post }
export type StoredPostResponse = PostResponse & { postId: string }
export class UnsupportedPostVersionError extends Error {
  constructor(readonly version: unknown) { super('unsupported_social_post_version') }
}

export function safeWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown, max = 4096): value is string => typeof value === 'string' && value.length <= max
const optional = (value: unknown, valid: (value: unknown) => boolean) => value === undefined || valid(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const timestamp = (value: unknown) => string(value, 64) && Number.isFinite(Date.parse(value))
export const validAssetId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function validIdentity(value: unknown): value is Identity {
  if (!object(value) || !string(value.provider, 32) || !/^[a-z][a-z0-9-]*$/.test(value.provider) || !string(value.id) || !value.id) return false
  return value.origin === undefined || (safeWebUrl(value.origin) && new URL(value.origin).origin === value.origin)
}
function validAsset(value: unknown): value is Asset {
  return object(value) && validAssetId(value.id) && string(value.url, 8192) &&
    (value.url.startsWith('/v1/sns/') || value.url.startsWith('/api/v1/sns/') || safeWebUrl(value.url)) &&
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(String(value.contentType)) &&
    Number.isInteger(value.byteLength) && finite(value.byteLength) && value.byteLength <= 20 * 1024 * 1024
}
function validJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 6) return false
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return true
  if (typeof value === 'string') return value.length <= 4096
  if (Array.isArray(value)) return value.length <= 64 && value.every((item) => validJson(item, depth + 1))
  return object(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, item]) =>
    key.length <= 128 && !['__proto__', 'prototype', 'constructor'].includes(key) && validJson(item, depth + 1))
}
function validFeature(value: Record<string, unknown>) {
  switch (value.type) {
    case 'link': return safeWebUrl(value.url) && optional(value.displayText, string)
    case 'mention': return (value.identity !== undefined || value.handle !== undefined || value.url !== undefined) &&
      optional(value.identity, validIdentity) && optional(value.handle, string) && optional(value.url, safeWebUrl)
    case 'hashtag': case 'cashtag': return string(value.tag) && !!value.tag && optional(value.url, safeWebUrl)
    case 'bold': case 'italic': case 'underline': case 'strikethrough': case 'code': case 'blockquote': case 'spoiler': return true
    case 'pre': return optional(value.language, (v) => string(v, 64))
    case 'emoji': return string(value.id) && !!value.id && optional(value.name, string)
    case 'extension': return string(value.name, 128) && /^[a-z][a-z0-9-]*:[\w.-]+$/.test(value.name) && optional(value.data, validJson)
    default: return false
  }
}
/** Maps only whole Unicode scalar boundaries; offsets splitting a surrogate/UTF-8 sequence are invalid. */
function offsetMap(text: string, encoding: OffsetEncoding) {
  const result = new Map<number, number>([[0, 0]])
  let source = 0
  let utf16 = 0
  for (const char of text) {
    const point = char.codePointAt(0)!
    if (point >= 0xd800 && point <= 0xdfff) throw new Error('invalid_unicode_text')
    source += encoding === 'utf16' ? char.length : encoding === 'codepoint' ? 1 : point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    utf16 += char.length
    result.set(source, utf16)
  }
  return result
}
export function validRichText(value: unknown): value is RichText {
  if (!object(value) || !string(value.text, SNS_LIMITS.text) || value.offsetEncoding !== 'utf16' ||
    !Array.isArray(value.entities) || value.entities.length > SNS_LIMITS.entities) return false
  let boundaries: Map<number, number>
  try { boundaries = offsetMap(value.text, 'utf16') } catch { return false }
  return value.entities.every((entity) => object(entity) && typeof entity.start === 'number' && typeof entity.end === 'number' &&
    entity.start < entity.end && boundaries.has(entity.start) && boundaries.has(entity.end) && validFeature(entity))
}
/** Provider adapters may drop invalid annotations while preserving the exact plain text. */
export function normalizeRichText(text: string, entities: Entity[] = [], encoding: OffsetEncoding = 'utf16', invalidEntities: 'reject' | 'drop' = 'reject'): RichText {
  if (text.length > SNS_LIMITS.text || (invalidEntities === 'reject' && entities.length > SNS_LIMITS.entities) ||
    !['utf8', 'utf16', 'codepoint'].includes(encoding)) throw new Error('invalid_rich_text')
  const map = offsetMap(text, encoding)
  const normalized: Entity[] = []
  for (const entity of entities) {
    const start = map.get(entity.start)
    const end = map.get(entity.end)
    if (start === undefined || end === undefined || start >= end || !validFeature(entity)) {
      if (invalidEntities === 'drop') continue
      throw new Error('invalid_rich_text_entity')
    }
    normalized.push({ ...entity, start, end })
    if (invalidEntities === 'drop' && normalized.length === SNS_LIMITS.entities) break
  }
  return { text, offsetEncoding: 'utf16', entities: normalized }
}
export function richTextSegments(value: RichText): { text: string; entities: Entity[] }[] {
  const text = value.text
  if (!validRichText(value)) return [{ text, entities: [] }]
  const points = [...new Set([0, value.text.length, ...value.entities.flatMap((e) => [e.start, e.end])])].sort((a, b) => a - b)
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    return { text: value.text.slice(start, end), entities: value.entities.filter((e) => e.start <= start && e.end >= end) }
  })
}
function validMedia(value: unknown): value is Media {
  if (!object(value)) return false
  if (!optional(value.alt, string) || !optional(value.width, finite) || !optional(value.height, finite) || !optional(value.durationMs, finite)) return false
  switch (value.type) {
    case 'image': return validAsset(value.image)
    case 'video': return value.availability === 'preview' && validAsset(value.thumbnail)
    case 'audio': return value.availability === 'preview' && optional(value.artwork, validAsset) && optional(value.title, string)
    default: return false
  }
}
const sameIdentity = (a: Identity, b: Identity) => a.provider === b.provider && a.id === b.id && a.origin === b.origin
export function validPost(value: unknown): value is Post {
  let count = 0
  const visit = (value: unknown, depth: number): value is Post => {
    if (++count > SNS_LIMITS.posts || depth > SNS_LIMITS.depth || !object(value) || !validIdentity(value.identity) || !safeWebUrl(value.url)) return false
    const author = value.author
    if (!object(author) || !validIdentity(author.identity) || !string(author.displayName) || !optional(author.handle, string) ||
      !optional(author.url, safeWebUrl) || !optional(author.avatar, validAsset)) return false
    if (!validRichText(value.content) || !optional(value.title, validRichText) || !optional(value.contentWarning, validRichText) ||
      !optional(value.createdAt, timestamp) || !optional(value.editedAt, timestamp) || !optional(value.language, (v) => string(v, 64)) ||
      !optional(value.sensitive, (v) => typeof v === 'boolean')) return false
    if (!Array.isArray(value.media) || value.media.length > SNS_LIMITS.media || !value.media.every(validMedia)) return false
    if (!Array.isArray(value.links) || value.links.length > SNS_LIMITS.links || !value.links.every((link) => object(link) && safeWebUrl(link.url) &&
      string(link.title) && string(link.description, 50_000) && optional(link.thumbnail, validAsset))) return false
    if (value.extensions !== undefined && (!object(value.extensions) || Object.keys(value.extensions).length > 16 ||
      JSON.stringify(value.extensions).length > 16_384 || !Object.entries(value.extensions).every(([key, item]) =>
        /^[a-z][a-z0-9-]*:[\w.-]+$/.test(key) && validJson(item)))) return false
    return Array.isArray(value.relations) && value.relations.length <= SNS_LIMITS.relations && value.relations.every((relation) => {
      if (!object(relation) || !['reply', 'reply-root', 'quote', 'repost', 'crosspost'].includes(String(relation.type)) || !validIdentity(relation.target)) return false
      if (relation.state === 'reference') return true
      if (relation.state === 'unavailable') return string(relation.reason, 256)
      return relation.state === 'available' && visit(relation.post, depth + 1) && sameIdentity(relation.target, relation.post.identity)
    })
  }
  return visit(value, 0) && postAssets(value as Post).length <= SNS_LIMITS.assets
}
/** The same enumeration drives authorization, server verification and client offline downloads. */
export function postAssets(post: Post): Asset[] {
  const assets: Asset[] = []
  const visit = (value: Post) => {
    if (value.author.avatar) assets.push(value.author.avatar)
    for (const media of value.media) {
      const asset = media.type === 'image' ? media.image : media.type === 'video' ? media.thumbnail : media.artwork
      if (asset) assets.push(asset)
    }
    for (const link of value.links) if (link.thumbnail) assets.push(link.thumbnail)
    for (const relation of value.relations) if (relation.state === 'available') visit(relation.post)
  }
  visit(post)
  return assets
}
export function decodePostResponse(value: unknown): PostResponse {
  if (!object(value)) throw new Error('invalid_social_post')
  switch (value.version) {
    case 1:
      if (!timestamp(value.fetchedAt) || !validPost(value.post)) throw new Error('invalid_social_post')
      return value as unknown as PostResponse
    default: throw new UnsupportedPostVersionError(value.version)
  }
}
export function decodeStoredPostResponse(value: unknown): StoredPostResponse {
  const response = decodePostResponse(value)
  if (!validAssetId((value as Record<string, unknown>).postId)) throw new Error('invalid_social_post')
  return response as StoredPostResponse
}
