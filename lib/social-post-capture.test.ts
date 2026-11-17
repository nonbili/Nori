import { describe, expect, it } from 'bun:test'
import { socialTarget } from './social-post'
import { capturedSocialPost, messageDocuments, parseCaptureMessage, responseDocuments } from './social-post-capture'

const responses = (...bodies: string[]) => bodies.flatMap(responseDocuments)

const author = { username: 'alice', full_name: 'Alice', profile_pic_url: 'https://cdn.test/avatar.jpg' }
const item = (code: string) => ({ code, user: author, caption: { text: 'Hello' }, taken_at: 1794700000,
  image_versions2: { candidates: [{ url: 'https://cdn.test/image.jpg' }] } })

describe('posts captured from their page', () => {
  it('reads prefixed and line-streamed response bodies', () => {
    expect(responseDocuments('for (;;);{"a":1}')).toEqual([{ a: 1 }])
    expect(responseDocuments('{"a":1}\n{"b":2}\nnot json')).toEqual([{ a: 1 }, { b: 2 }])
    expect(responseDocuments('<html>')).toEqual([])
  })

  it('finds the exact target post in an API response, ignoring other posts', () => {
    const target = socialTarget('https://www.instagram.com/p/target/')!
    const other = JSON.stringify({ data: { items: [item('other')] } })
    expect(capturedSocialPost(target, responses(other))).toBeUndefined()
    const response = JSON.stringify({ data: { xdt_api__v1__media__shortcode__web_info: { items: [item('target')] } } })
    const post = capturedSocialPost(target, responses(other, response))
    expect(post?.author).toBe('Alice')
    expect(post?.text).toBe('Hello')
  })

  it('falls back to the data the rendered page embeds', () => {
    const target = socialTarget('https://www.threads.com/@alice/post/target')!
    const html = `<script type="application/json">${JSON.stringify({ post: item('target') })}</script>`
    expect(capturedSocialPost(target, messageDocuments({ type: 'nori-capture-page', html }))?.handle).toBe('alice')
  })

  it('accepts only its own message shapes', () => {
    expect(parseCaptureMessage('{"type":"nori-capture-response","url":"u","body":"b"}')?.type).toBe('nori-capture-response')
    expect(parseCaptureMessage('{"type":"other"}')).toBeUndefined()
    expect(parseCaptureMessage('nope')).toBeUndefined()
  })
})
