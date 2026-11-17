import { expect, it } from 'bun:test'
import { normalizeSocialImage, readSocialImageFile } from './social-post-image-core'

it('normalizes JPEG aliases and rejects unsupported captures before they can be saved', () => {
  expect(normalizeSocialImage('data:image/jpg;base64,AQID')).toBe('data:image/jpeg;base64,AQID')
  for (const value of ['data:image/svg+xml;base64,AQID', 'data:image/x-icon;base64,AQID', 'data:image/heic;base64,AQID', 'https://cdn.test/a.jpg', 'data:image/png;base64,'])
    expect(() => normalizeSocialImage(value)).toThrow('invalid_saved_post_media')
})
it('identifies native image files by bytes rather than their fallback extension', async () => {
  const png = btoa('\x89PNG\r\n\x1a\nbytes')
  const uri = 'file:///Documents/bookmark-previews/unknown.jpg'
  const result = await readSocialImageFile(uri, async (path) => { expect(path).toBe(uri); return png })
  expect(result).toBe(`data:image/png;base64,${png}`)
  await expect(readSocialImageFile(uri, async () => btoa('<svg></svg>'))).rejects.toThrow('invalid_saved_post_media')
})
it('never fetches provider URLs when reading an archived image', async () => {
  await expect(readSocialImageFile('https://provider.test/image', async () => { throw new Error('must_not_read') })).rejects.toThrow('invalid_saved_post_media')
})
