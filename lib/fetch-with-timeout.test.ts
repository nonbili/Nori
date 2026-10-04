import { describe, expect, it } from 'bun:test'
import { fetchWithTimeout } from './fetch-with-timeout'

describe('fetch timeout and cancellation', () => {
  it('times out a body that stalls after headers arrive', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('partial body'))
            },
          }),
        ),
    })
    try {
      await expect(fetchWithTimeout(server.url.href, {}, 100)).rejects.toThrow('request_cancelled')
    } finally {
      server.stop(true)
    }
  })
  it('honors cancellation during the body and preserves response metadata', async () => {
    let started!: () => void
    const bodyStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const server = Bun.serve({
      port: 0,
      fetch: (request) =>
        request.url.endsWith('/stall')
          ? new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('partial'))
                  started()
                },
              }),
            )
          : new Response('complete body', { headers: { 'content-type': 'text/html' } }),
    })
    try {
      const controller = new AbortController()
      const request = fetchWithTimeout(new URL('/stall', server.url).href, { signal: controller.signal })
      const rejected = request.catch((error: Error) => error)
      await bodyStarted
      controller.abort()
      expect((await rejected) instanceof Error).toBe(true)
      const response = await fetchWithTimeout(server.url.href)
      expect(response.url).toBe(server.url.href)
      expect(response.headers.get('content-type')).toBe('text/html')
      expect(await response.text()).toBe('complete body')
    } finally {
      server.stop(true)
    }
  })
})
