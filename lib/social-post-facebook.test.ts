import { describe, expect, it } from 'bun:test'
import { fetchSocialPost, socialTarget } from './social-post'
import { parsePageSocialPost } from './social-post-providers'

const actor = { name: 'Alice', url: 'https://www.facebook.com/alice/', profile_picture: { uri: 'https://cdn.test/avatar.jpg' } }
const photo = (id: string) => ({ __typename: 'Photo', id, image: { uri: `https://cdn.test/${id}.jpg`, width: 640, height: 480 } })
const story = (id = '123'): any => ({ __typename: 'Story', post_id: id, permalink_url: `https://www.facebook.com/alice/posts/${id}/`,
  actors: [actor], creation_time: 1794514607, message: { text: 'Hello 🌍' }, attachments: [{ media: photo('1') }] })
const page = (...values: any[]) => values.map((value) => `<script type="application/json" data-sjs>${JSON.stringify(value)}</script>`).join('')
const parse = (value: any, url = 'https://www.facebook.com/alice/posts/123/') => parsePageSocialPost(page(value), socialTarget(url)!)

describe('Facebook saved posts', () => {
  it('recognizes post, group, reel, video and query permalinks, not profiles or lookalike hosts', () => {
    for (const path of ['/alice/posts/123/', '/groups/science/posts/123/', '/reel/123/', '/alice/videos/123/',
      '/story.php?story_fbid=123&id=456', '/permalink.php?story_fbid=123&id=456', '/watch/?v=123'])
      expect(socialTarget(`https://m.facebook.com${path}`)).toMatchObject({ site: 'facebook', id: '123' })
    expect(socialTarget('https://www.facebook.com/alice/posts/pfbidABC123')).toMatchObject({ site: 'facebook', id: 'pfbidABC123' })
    for (const url of ['https://facebook.com/alice', 'https://facebook.com.evil.test/alice/posts/123', 'https://facebook.com/alice/posts/nope'])
      expect(socialTarget(url)).toBeUndefined()
  })

  it('normalizes the transport host and requests the structured crawler page', async () => {
    const post = await fetchSocialPost(socialTarget('https://m.facebook.com/alice/posts/123/#fragment')!, async (url, _, format, headers) => {
      expect(url).toBe('https://www.facebook.com/alice/posts/123/')
      expect(format).toBe('html')
      expect(headers?.['User-Agent']).toContain('Googlebot')
      return page(story())
    })
    expect(post).toMatchObject({ site: 'facebook', author: 'Alice', handle: 'alice', text: 'Hello 🌍',
      createdAt: '2026-11-12T20:16:47.000Z', avatar: { url: 'https://cdn.test/avatar.jpg' } })
  })

  it('selects the exact story through wrappers and excludes feedback and actor media', () => {
    const value = story()
    value.feedback = { story: story('999'), message: { text: 'Comment' }, media: photo('comment') }
    value.actors[0] = { ...actor, media: photo('actor') }
    const post = parse({ require: [{ __bbox: { result: { data: { edges: [{ node: story('999') }, { node: value }] } } } }] })
    expect(post.text).toBe('Hello 🌍')
    expect(post.media.map((item) => item.url)).toEqual(['https://cdn.test/1.jpg'])
  })

  it('matches a pfbid permalink when post_id is numeric and query permalinks by story_fbid', () => {
    for (const url of ['https://www.facebook.com/alice/posts/pfbidABC123/', 'https://www.facebook.com/story.php?story_fbid=pfbidABC123&id=456'])
      expect(parse({ ...story(), permalink_url: url }, url).text).toBe('Hello 🌍')
  })

  it('matches a story whose pfbid differs from the link only through the page route for the link', () => {
    const link = 'https://www.facebook.com/alice/posts/pfbidLINK/'
    const own = { ...story(), permalink_url: 'https://www.facebook.com/alice/posts/pfbidPAGE' }
    const route = { url: '/alice/posts/pfbidLINK', params: { story_token: 'pfbidPAGE' } }
    expect(parse([route, own], link).text).toBe('Hello 🌍')
    // A route for another link names no alias for this one.
    expect(() => parse([{ ...route, url: '/alice/posts/pfbidOTHER' }, own], link)).toThrow()
  })

  it('reads section-wrapped metadata and prefers an author copy with an avatar', () => {
    const value = { __typename: 'Story', post_id: '123', actors: [{ name: 'Alice' }], comet_sections: {
      content: { story: { message: { text: 'Wrapped' }, actors: [actor], attachments: [{ media: photo('1') }] } },
      context_layout: { story: { creation_time: 1794514607, permalink_url: story().permalink_url } },
    } }
    expect(parse(value)).toMatchObject({ text: 'Wrapped', avatar: { url: 'https://cdn.test/avatar.jpg' }, handle: 'alice' })
  })

  it('deduplicates reference-only media and preserves complete gallery order and video labels', () => {
    const value = story()
    value.attachments = [{ media: { __typename: 'Photo', id: '1' } }, { all_subattachments: { count: 2, nodes: [
      { media: { ...photo('1'), viewer_image: { uri: 'https://cdn.test/large.jpg', width: 1200 } } },
      { media: { __typename: 'Video', id: '2', preferred_thumbnail: { image: { uri: 'https://cdn.test/video.jpg' } } } },
    ] } }]
    expect(parse(value).media).toMatchObject([{ type: 'image', url: 'https://cdn.test/large.jpg' }, { type: 'video', url: 'https://cdn.test/video.jpg' }])
  })

  it('keeps shared text, author and media separate from outer content', () => {
    const value = story()
    value.attached_story = { ...story('456'), actors: [{ ...actor, name: 'Bob' }], message: { text: 'Shared' }, attachments: [{ media: photo('shared') }] }
    const post = parse(value)
    expect(post.text).toBe('Hello 🌍')
    expect(post.media).toHaveLength(1)
    expect(post.nested).toMatchObject({ author: 'Bob', text: 'Shared', media: [{ url: 'https://cdn.test/shared.jpg' }] })
    value.attached_story = { message: { text: 'Unavailable shared post' } }
    expect(parse(value).nested).toBeUndefined()
    expect(parse(value).text).toBe('Hello 🌍')
  })

  it('joins video playback and creation metadata only for the exact video ID', () => {
    const url = 'https://www.facebook.com/alice/videos/789/'
    const playback = { __typename: 'Video', id: '789', publish_time: 1794514607,
      preferred_thumbnail: { image: { uri: 'https://cdn.test/video.jpg' } } }
    const context = { __typename: 'Video', id: '789', creation_story: { actors: [actor], message: { text: 'Video text' } } }
    const target = socialTarget(url)!
    expect(parsePageSocialPost(page(playback, context), target)).toMatchObject({ text: 'Video text',
      author: 'Alice', media: [{ type: 'video', url: 'https://cdn.test/video.jpg' }] })
    expect(() => parsePageSocialPost(page(playback, { ...context, id: '999' }), target)).toThrow('social_post_unavailable')
    expect(() => parsePageSocialPost(page({ ...playback, id: '999' }, context), target)).toThrow('social_post_unavailable')
  })

  it('rejects login shells, mismatched stories, missing metadata and incomplete galleries', () => {
    for (const value of [story('999'), { ...story(), actors: [] }, { ...story(), creation_time: null },
      { ...story(), attachments: [{ media: { __typename: 'Photo', id: 'missing' } }] },
      { ...story(), attachments: [{ all_subattachments: { count: 2, nodes: [{ media: photo('1') }] } }] },
      ...[undefined, null, {}, 'xx'].map((nodes) => ({ ...story(), attachments: [{ all_subattachments: { count: 2, nodes } }] })),
      { ...story(), attachments: [{ media: { __typename: 'Video', id: 'missing' } }] },
    ]) expect(() => parse(value)).toThrow('social_post_unavailable')
    expect(() => parsePageSocialPost('<meta property="og:image" content="https://cdn.test/preview.jpg">', socialTarget(story().permalink_url)!)).toThrow('social_post_unavailable')
  })
})
