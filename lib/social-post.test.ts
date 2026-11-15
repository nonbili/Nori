import { describe, expect, it } from 'bun:test'
import { fetchSocialPost, parseBlueskyPost, parseMastodonPost, parseRedditPost, postMedia, socialTarget } from './social-post'

describe('saved social posts', () => {
  it('recognizes public post permalinks without treating profiles as posts', () => {
    expect(socialTarget('https://bsky.app/profile/alice.test/post/abc')?.site).toBe('bluesky')
    expect(socialTarget('https://mastodon.social/@alice/123')?.id).toBe('123')
    expect(socialTarget('https://www.reddit.com/r/test/comments/abc/title/')?.site).toBe('reddit')
    expect(socialTarget('https://redd.it/abc')?.id).toBe('abc')
    expect(socialTarget('https://bsky.app/profile/alice.test')).toBeUndefined()
    expect(socialTarget('file:///users/alice/statuses/1')).toBeUndefined()
    expect(socialTarget('https://evil.test/profile/alice/post/1')).toBeUndefined()
  })
  it('keeps Bluesky text, images and quoted video thumbnails, never video bytes', () => {
    const post = parseBlueskyPost({
      uri: 'at://did:plc:alice/app.bsky.feed.post/one', author: { handle: 'alice.test', avatar: 'https://cdn.test/avatar.jpg' }, record: { text: 'Hello 日本語', createdAt: '2026-11-15T08:00:00Z' },
      embed: { $type: 'app.bsky.embed.recordWithMedia#view',
        media: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.test/photo.jpg', alt: 'Photo' }] },
        record: { record: { $type: 'app.bsky.embed.record#viewRecord', uri: 'at://did:plc:bob/app.bsky.feed.post/two',
          author: { handle: 'bob.test' }, value: { text: 'Quoted' },
          embeds: [{ $type: 'app.bsky.embed.video#view', playlist: 'https://cdn.test/video.m3u8', thumbnail: 'https://cdn.test/thumb.jpg' }] } },
      },
    })
    expect(post.text).toBe('Hello 日本語')
    expect(post.handle).toBe('alice.test')
    expect(post.avatar?.url).toBe('https://cdn.test/avatar.jpg')
    expect(post.createdAt).toBe('2026-11-15T08:00:00.000Z')
    expect(post.nested?.text).toBe('Quoted')
    expect(postMedia(post).map((item) => item.type)).toEqual(['image', 'video'])
    expect(JSON.stringify(post)).not.toContain('m3u8')
  })
  it('strips Mastodon HTML, preserves nested posts, and uses video previews', () => {
    const post = parseMastodonPost({ id: '1', url: 'https://mastodon.social/@alice/1', content: '<p>A &amp; B</p><script>bad()</script>',
      media_attachments: [{ type: 'video', url: 'https://cdn.test/video.mp4', preview_url: 'https://cdn.test/thumb.jpg' }],
      quote: { quoted_status: { id: '2', url: 'https://mastodon.social/@bob/2', content: '<p>Nested</p>' } },
    })
    expect(post.text).toBe('A & B')
    expect(post.media[0]).toMatchObject({ type: 'video', url: 'https://cdn.test/thumb.jpg' })
    expect(post.nested?.text).toBe('Nested')
  })
  it('saves a post whose quoted post is unavailable', () => {
    const post = parseMastodonPost({ id: '1', url: 'https://mastodon.social/@alice/1', content: '<p>Outer</p>',
      quote: { id: '9', state: 'deleted', quoted_status: null } })
    expect(post.text).toBe('Outer')
    expect(post.nested).toBeUndefined()
  })
  it('archives Reddit galleries in order and crossposts recursively', () => {
    const post = parseRedditPost({ id: '1', permalink: '/r/test/comments/1/title', title: 'Title', selftext: 'Body',
      gallery_data: { items: [{ media_id: 'a' }, { media_id: 'b' }] },
      media_metadata: { a: { s: { u: 'https://cdn.test/a.jpg?a=1&amp;b=2' } }, b: { s: { u: 'javascript:bad' } } },
      crosspost_parent_list: [{ id: '2', permalink: '/r/test/comments/2/title', title: 'Original' }],
    })
    expect(post.text).toBe('Title\n\nBody')
    expect(post.media).toHaveLength(1)
    expect(post.media[0].url).toBe('https://cdn.test/a.jpg?a=1&b=2')
    expect(post.nested?.text).toBe('Original')
  })
  it('fetches only the target post, not a profile feed', async () => {
    const urls: string[] = []
    await fetchSocialPost(socialTarget('https://bsky.app/profile/did:plc:alice/post/one')!, async (url) => {
      urls.push(url)
      return { thread: { post: { uri: 'at://did:plc:alice/app.bsky.feed.post/one', record: { text: 'Post' } } } }
    })
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('getPostThread')
  })
})
