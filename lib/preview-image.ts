import { fetchWithTimeout } from './fetch-with-timeout'
import { PreviewResponseError, persistentPreviewStatus } from './bookmark-preview-types'

export async function fetchPreviewImage(url: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout(url, { signal })
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!response.ok || !/^image\/[a-z0-9.+-]+$/.test(contentType))
    throw new PreviewResponseError('preview_image_failed', response.ok || persistentPreviewStatus(response.status))
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 5 * 1024 * 1024) throw new PreviewResponseError('preview_image_too_large', true)
  // Native Blob cannot be constructed from ArrayBuffer. Encode bytes directly,
  // in chunks small enough to avoid the argument limit for fromCharCode().
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  return `data:${contentType};base64,${btoa(chunks.join(''))}`
}
