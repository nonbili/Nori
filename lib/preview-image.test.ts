import { describe, expect, it } from 'bun:test'
import { fetchPreviewImage } from './preview-image'
import { PreviewResponseError } from './bookmark-preview-types'

describe('preview image downloads', () => {
  it('encodes binary bytes, including across chunk boundaries, without Blob/FileReader', async () => {
    const bytes = new Uint8Array(20000)
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(bytes, {
          headers: { 'content-type': 'image/png; charset=binary' },
        }),
    })
    const originalBlob = Response.prototype.blob
    // Reproduce native's unsupported ArrayBuffer -> Blob conversion instead
    // of relying on Bun's more capable Response implementation.
    Response.prototype.blob = () => {
      throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported")
    }
    try {
      const image = await fetchPreviewImage(server.url.href)
      expect(image).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`)
    } finally {
      Response.prototype.blob = originalBlob
      server.stop(true)
    }
  })
  it('classifies permanent image failures separately from temporary server errors', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        const status = Number(new URL(request.url).pathname.slice(1))
        return new Response('not an image', { status, headers: { 'content-type': 'text/html' } })
      },
    })
    try {
      for (const [status, persistent] of [
        [200, true],
        [404, true],
        [503, false],
        [429, false],
      ] as const) {
        const error = await fetchPreviewImage(new URL(`/${status}`, server.url).href).catch((error) => error)
        expect(error).toBeInstanceOf(PreviewResponseError)
        expect(error.persistent).toBe(persistent)
      }
    } finally {
      server.stop(true)
    }
  })
})
