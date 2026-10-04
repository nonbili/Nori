// Keep the combined cancellation signal alive until the entire body is read.
// Buffering here also bounds body reads in getMeta and image downloads.
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const signal = init.signal
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, timeoutMs)
  const cancelled = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => {
        const error = new Error('request_cancelled')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true },
    )
  })
  try {
    if (controller.signal.aborted) throw new Error('request_cancelled')
    return await Promise.race([
      cancelled,
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal })
        const body = await response.arrayBuffer()
        const buffered = new Response(
          init.method === 'HEAD' || [204, 205, 304].includes(response.status) ? null : body,
          { status: response.status, statusText: response.statusText, headers: response.headers },
        )
        Object.defineProperty(buffered, 'url', { value: response.url })
        return buffered
      })(),
    ])
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
