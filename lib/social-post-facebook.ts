import type { SocialMedia, SocialPost, SocialTarget } from './social-post'

const SKIP = new Set(['feedback', 'comet_feed_ufi_container', 'comments', 'actors', 'profile_picture', 'owner', 'attached_story', 'target', 'creation_story'])
const http = (value: any): string => {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : '' } catch { return '' }
}
// Facebook repeats fields across section wrappers. Never pick a comment's or
// attached story's author, text, date or media for the outer post.
function find(value: any, key: string, accept: (value: any) => boolean, depth = 0): any {
  if (!value || typeof value !== 'object' || depth > 30) return
  if (accept(value[key])) return value[key]
  for (const [name, child] of Object.entries(value)) {
    if (SKIP.has(name)) continue
    const found = find(child, key, accept, depth + 1)
    if (found !== undefined) return found
  }
}
const string = (value: any) => typeof value === 'string' && value.length > 0

function storyPost(story: any, depth = 0): SocialPost {
  const permalink = find(story, 'permalink_url', string)
  const actors = find(story, 'actors', (value) => Array.isArray(value) && value[0]?.name && value[0]?.profile_picture) ||
    find(story, 'actors', (value) => Array.isArray(value) && typeof value[0]?.name === 'string')
  const author = actors?.[0]
  const message = find(story.comet_sections?.content?.story || story, 'message', (value) => typeof value?.text === 'string')
  const created = find(story, 'creation_time', (value) => typeof value === 'number' && value > 0)
  if (!http(permalink) || !author || !created) throw new Error('social_post_unavailable')
  const media: SocialMedia[] = []
  const seen = new Set<string>()
  const expected = new Set<string>()
  function walk(value: any, level = 0) {
    if (!value || typeof value !== 'object' || level > 30) return
    if (value.__typename === 'Photo' || value.__typename === 'Video') {
      const video = value.__typename === 'Video'
      const sizes = video ? [value.preferred_thumbnail?.image, value.thumbnailImage, value.image] :
        [value.viewer_image, value.photo_image, value.image].sort((a, b) => (b?.width || 0) - (a?.width || 0))
      const image = sizes.find((item) => http(item?.uri))
      const key = String(value.id || image?.uri || '')
      if (key) expected.add(key)
      else if (!image) throw new Error('social_post_unavailable')
      if (image && !seen.has(key)) {
        seen.add(key)
        media.push({ type: video ? 'video' : 'image', url: http(image.uri), width: image.width, height: image.height,
          alt: typeof value.accessibility_caption === 'string' ? value.accessibility_caption : undefined })
      }
      return
    }
    const gallery = value.all_subattachments
    if ((gallery?.count > 0 && (!Array.isArray(gallery.nodes) || gallery.count > gallery.nodes.length)) || gallery?.page_info?.has_next_page)
      throw new Error('social_post_unavailable')
    for (const [key, child] of Object.entries(value)) if (!SKIP.has(key)) walk(child, level + 1)
  }
  walk(story)
  if (media.length > 12 || [...expected].some((key) => !seen.has(key))) throw new Error('social_post_unavailable')
  const shared = find(story, 'attached_story', (value) => value && typeof value === 'object')
  let nested: SocialPost | undefined
  if (shared && depth < 2) { try { nested = storyPost(shared, depth + 1) } catch {} }
  const avatar = http(author.profile_picture?.uri || author.profile_picture?.image?.uri)
  let handle = ''
  try { handle = new URL(author.url).pathname.replace(/^\/|\/$/g, '') } catch {}
  return { site: 'facebook', url: http(permalink), author: author.name, handle: handle || undefined,
    ...(avatar ? { avatar: { type: 'image', url: avatar } } : {}),
    createdAt: new Date(created * 1000).toISOString(), text: message?.text || '', media, ...(nested ? { nested } : {}) }
}

/** Returns only an exact target story, not a suggested post on a login page. */
export function parseFacebookPost(document: any, target: SocialTarget): SocialPost | undefined {
  const stack = [{ value: document, depth: 0 }]
  const videos: any[] = []
  let count = 0
  while (stack.length && count++ < 50_000) {
    const { value, depth } = stack.pop()!
    if (!value || typeof value !== 'object' || depth > 40) continue
    if (value.__typename === 'Video' && String(value.id) === target.id) videos.push(value)
    if (value.__typename === 'Story') {
      const permalink = find(value, 'permalink_url', string)
      // pfbid URLs can have a numeric post_id; match their own permalink too.
      let pathId: string | undefined
      try {
        const url = new URL(permalink)
        if (['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(url.hostname))
          pathId = url.pathname.match(/\/(?:posts|videos|reel)\/([A-Za-z0-9]+)(?:\/|$)/)?.[1] ||
            url.searchParams.get('story_fbid') || url.searchParams.get('v') || undefined
      } catch {}
      if (String(value.post_id) === target.id || pathId === target.id) {
        try { return storyPost(value) } catch { /* A later document may contain the complete section. */ }
      }
    }
    for (const [key, child] of Object.entries(value)) if (!SKIP.has(key)) stack.push({ value: child, depth: depth + 1 })
  }
  // Video permalink pages split playback and creation-story metadata into
  // separate records. Join only records for the exact requested video ID.
  if (/\/(?:reel|watch|[^/]+\/videos)(?:\/|\?)/.test(target.url)) {
    const playback = videos.find((video) => http(video.preferred_thumbnail?.image?.uri || video.thumbnailImage?.uri))
    const context = videos.find((video) => video.creation_story)
    if (playback && context) {
      try {
        return storyPost({ ...context.creation_story, permalink_url: target.url,
          creation_time: playback.publish_time || find(context.creation_story, 'creation_time', (v) => typeof v === 'number' && v > 0),
          attachments: [{ media: playback }] })
      } catch {}
    }
  }
}
