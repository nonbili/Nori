import { describe, expect, it } from 'bun:test'
import { fetchSocialPost, socialTarget, validSocialPost } from './social-post'
import { parsePageSocialPost, parseXPost } from './social-post-providers'

const page = (value: unknown) => `<script type="application/json">${JSON.stringify(value)}</script>`
const author = { username: 'alice', full_name: 'Alice 日本語', profile_pic_url: 'https://cdn.test/avatar.jpg' }
const thread = (code: string) => ({ code, user: author, caption: { text: 'Hello 🎉' }, taken_at: 1794700000,
  image_versions2: { candidates: [{ url: 'https://cdn.test/image.jpg' }] } })

describe('additional social providers', () => {
  it('recognizes permalinks and rejects profiles, lookalike hosts and malformed URLs', () => {
    for (const [link, site, id] of [
      ['https://twitter.com/alice/status/123?ref=share', 'x', '123'],
      ['https://x.com/i/web/status/123', 'x', '123'],
      ['https://x.com/alice/status/123/photo/1', 'x', '123'],
      ['https://www.instagram.com/reel/Ab_C-1/', 'instagram', 'Ab_C-1'],
      ['https://threads.net/@alice/post/AbC', 'threads', 'AbC'],
      ['https://www.tiktok.com/@alice/photo/123', 'tiktok', '123'],
    ]) expect(socialTarget(link)).toMatchObject({ site, id })
    for (const link of ['https://x.com/alice', 'https://evil.x.com/alice/status/1', 'https://instagram.com/alice/',
      'https://threads.com/@alice', 'https://tiktok.com/@alice', 'https://user@x.com/a/status/1'])
      expect(socialTarget(link)).toBeUndefined()
  })

  it('reads X author/date, entity links, images, video covers and quotes', () => {
    const tweet = { id_str: '123', user: { name: 'Alice', screen_name: 'alice', profile_image_url_https: 'https://cdn.test/a.jpg' },
      text: 'Hi https://t.co/abc', created_at: '2026-11-15T08:00:00Z',
      entities: { urls: [{ indices: [3, 19], expanded_url: 'https://example.com/' }] },
      mediaDetails: [{ type: 'photo', media_url_https: 'https://cdn.test/image.jpg' },
        { type: 'video', media_url_https: 'https://cdn.test/cover.jpg', video_info: { url: 'https://cdn.test/video.mp4' } }],
      quoted_tweet: { id_str: '122', user: { screen_name: 'bob' }, text: 'Quote' },
    }
    tweet.entities.urls[0].indices[1] = tweet.text.length
    const post = parseXPost(tweet)
    expect(post.text).toBe('Hi https://example.com/')
    expect(post.handle).toBe('alice')
    expect(post.createdAt).toBe('2026-11-15T08:00:00.000Z')
    expect(post.media.map((item) => item.type)).toEqual(['image', 'video'])
    expect(post.nested?.text).toBe('Quote')
    expect(JSON.stringify(post)).not.toContain('mp4')
    expect(validSocialPost(post)).toBe(true)
  })

  it('selects the exact Threads post rather than suggested posts, including nested quotes', () => {
    const selected = { ...thread('target'), text_post_app_info: { share_info: { quoted_post: thread('quoted') } } }
    const post = parsePageSocialPost(page({ suggestions: [thread('other')], main: selected }),
      socialTarget('https://threads.com/@alice/post/target')!)
    expect(post.text).toBe('Hello 🎉')
    expect(post.url).toContain('/target')
    expect(post.nested?.url).toContain('/quoted')
    expect(post.avatar?.url).toBe(author.profile_pic_url)
    expect(validSocialPost(post)).toBe(true)
  })

  it('supports text-only Threads and unavailable nested posts', () => {
    const value = { ...thread('target'), media_type: 19, image_versions2: { candidates: [] },
      text_post_app_info: { share_info: { quoted_post: { code: 'deleted' } } } }
    const post = parsePageSocialPost(page(value), socialTarget('https://threads.com/@alice/post/target')!)
    expect(post.media).toEqual([])
    expect(post.nested).toBeUndefined()
  })

  it('replaces X links after supplementary Unicode characters without corrupting text', () => {
    const post = parseXPost({ id_str: '123', user: { screen_name: 'alice' },
      text: '🎉 https://t.co/abc 🦈 https://t.co/def', entities: { urls: [
        { indices: [2, 18], expanded_url: 'https://example.com/first' },
        { indices: [21, 37], expanded_url: 'https://example.com/second' },
      ] } })
    expect(post.text).toBe('🎉 https://example.com/first 🦈 https://example.com/second')
  })

  it('annotates X links, mentions and tags as X shows them, dropping trailing media links', () => {
    const post = parseXPost({ id_str: '123', user: { screen_name: 'alice' },
      text: '🎉 @bob read https://t.co/abc #nori $AAPL &amp; more https://t.co/pic', entities: {
        user_mentions: [{ indices: [2, 6], screen_name: 'bob' }],
        urls: [{ indices: [12, 28], expanded_url: 'https://example.com/a?b=1&c=2', display_url: 'example.com/a?b=1…' }],
        hashtags: [{ indices: [29, 34], text: 'nori' }], symbols: [{ indices: [35, 40], text: 'AAPL' }],
        media: [{ indices: [52, 68], expanded_url: 'https://x.com/alice/status/123/photo/1' }],
      } })
    expect(post.text).toBe('🎉 @bob read https://example.com/a?b=1&c=2 #nori $AAPL & more')
    const rich = post.richText!
    expect(rich.text).toBe('🎉 @bob read example.com/a?b=1… #nori $AAPL & more')
    expect(rich.entities.map((entity) => [entity.type, rich.text.slice(entity.start, entity.end), 'url' in entity ? entity.url : ''])).toEqual([
      ['mention', '@bob', 'https://x.com/bob'],
      ['link', 'example.com/a?b=1…', 'https://example.com/a?b=1&c=2'],
      ['hashtag', '#nori', 'https://x.com/hashtag/nori'],
      ['cashtag', '$AAPL', 'https://x.com/search?q=%24AAPL'],
    ])
    expect(validSocialPost(post)).toBe(true)
  })

  it('reads Instagram embed contextJSON, full caption and ordered carousel/video thumbnails', () => {
    const value = { gql_data: { shortcode_media: { shortcode: 'target', owner: author, taken_at_timestamp: 1794700000,
      edge_media_to_caption: { edges: [{ node: { text: 'Caption 日本語' } }] },
      edge_sidecar_to_children: { edges: [
        { node: { display_url: 'https://cdn.test/1.jpg' } },
        { node: { display_url: 'https://cdn.test/2.jpg', is_video: true, video_url: 'https://cdn.test/movie.mp4' } },
      ] },
    } } }
    const html = `<script>window.data = {"contextJSON": ${JSON.stringify(JSON.stringify(value))}};</script>`
    const post = parsePageSocialPost(html, socialTarget('https://instagram.com/p/target/')!)
    expect(post.text).toBe('Caption 日本語')
    expect(post.media.map((item) => item.type)).toEqual(['image', 'video'])
    expect(post.media[1].url).toBe('https://cdn.test/2.jpg')
    expect(validSocialPost(post)).toBe(true)
  })

  it('derives the original Instagram timestamp when embed data omits taken_at', () => {
    const post = parsePageSocialPost(page({ shortcode: 'target', id: '4002147050057771603', owner: author,
      display_url: 'https://cdn.test/image.jpg', edge_media_to_caption: { edges: [] } }),
    socialTarget('https://instagram.com/p/target/')!)
    expect(post.createdAt).toBe(new Date(Number(4002147050057771603n >> 23n) + 1314220021721).toISOString())
  })

  it('reads TikTok photo galleries and video covers without saving video URLs', () => {
    const value = { id: '123', author: { uniqueId: 'alice', nickname: 'Alice' }, desc: 'One\u2028Two', createTime: 1794700000,
      video: { playAddr: 'https://cdn.test/movie.mp4', cover: 'https://cdn.test/cover.jpg' } }
    const target = socialTarget('https://tiktok.com/@alice/video/123')!
    const post = parsePageSocialPost(page({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: value } } } }), target)
    expect(post.text).toBe('One\nTwo')
    expect(post.media[0]).toMatchObject({ type: 'video', url: 'https://cdn.test/cover.jpg' })
    const photos = parsePageSocialPost(page({ ...value, imagePost: { images: [
      { imageURL: { urlList: ['https://cdn.test/photo1.jpg'] } }, { imageURL: { urlList: ['https://cdn.test/photo2.jpg'] } },
    ] } }), target)
    expect(photos.media.map((item) => item.type)).toEqual(['image', 'image'])
    expect(photos.url).toContain('/photo/123')
  })

  it('rejects OG-only, login pages, missing gallery assets and mismatched post data', () => {
    const target = socialTarget('https://threads.com/@alice/post/target')!
    for (const html of ['<meta property="og:description" content="preview">', page(thread('wrong')),
      page({ ...thread('target'), carousel_media: [{ media_type: 2 }] })])
      expect(() => parsePageSocialPost(html, target)).toThrow('social_post_unavailable')
  })

  it('rejects known carousels with missing, empty or incomplete child lists', () => {
    const target = socialTarget('https://instagram.com/p/target/')!
    const base = { shortcode: 'target', owner: author, display_url: 'https://cdn.test/cover.jpg' }
    for (const gallery of [
      { __typename: 'GraphSidecar' },
      { __typename: 'GraphSidecar', edge_sidecar_to_children: { edges: [] } },
      { media_type: 8 }, { carousel_media: [] },
      { media_type: 8, carousel_media_count: 2, carousel_media: [{ display_url: 'https://cdn.test/1.jpg' }] },
    ]) expect(() => parsePageSocialPost(page({ ...base, ...gallery }), target)).toThrow('social_post_unavailable')
  })

  it('requests HTML through the host transport and verifies X target identity', async () => {
    const post = await fetchSocialPost(socialTarget('https://threads.net/@alice/post/target')!, async (url, signal, format, headers) => {
      expect(format).toBe('html')
      expect(headers?.['User-Agent']).toContain('Googlebot')
      expect(url).toBe('https://www.threads.com/@alice/post/target')
      return page(thread('target'))
    })
    expect(post.site).toBe('threads')
    await expect(fetchSocialPost(socialTarget('https://x.com/alice/status/123')!, async () => ({ id_str: '124' })))
      .rejects.toThrow('social_post_unavailable')
  })

  it('fetches TikTok photo permalinks on their photo route before trying the video representation', async () => {
    const target = socialTarget('https://www.tiktok.com/@alice/photo/123')!
    const value = { id: '123', author: { uniqueId: 'alice' }, desc: 'Photos',
      imagePost: { images: [{ imageURL: { urlList: ['https://cdn.test/photo.jpg'] } }] } }
    const urls: string[] = []
    await fetchSocialPost(target, async (url) => { urls.push(url); return page(value) })
    expect(urls).toEqual(['https://www.tiktok.com/@alice/photo/123'])
    urls.length = 0
    const post = await fetchSocialPost(target, async (url) => {
      urls.push(url)
      return url.includes('/photo/') ? '<html>App shell</html>' : page(value)
    })
    expect(urls).toEqual(['https://www.tiktok.com/@alice/photo/123', 'https://www.tiktok.com/@alice/video/123'])
    expect(post.media[0].type).toBe('image')
    urls.length = 0
    const partial = { id: '123', author: { uniqueId: 'alice' }, desc: 'Photos', video: { cover: 'https://cdn.test/cover.jpg' } }
    const recovered = await fetchSocialPost(target, async (url) => {
      urls.push(url)
      return page(url.includes('/photo/') ? partial : value)
    })
    expect(urls).toHaveLength(2)
    expect(recovered.media[0].type).toBe('image')
    await expect(fetchSocialPost(target, async () => page(partial))).rejects.toThrow('social_post_unavailable')
  })
})
