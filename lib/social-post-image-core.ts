import { base64ToBytes } from './screenshot-sync'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Use the same formats for local captures and private cloud uploads. */
export function normalizeSocialImage(image: string) {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif|avif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(image)
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('invalid_saved_post_media')
  const bytes = base64ToBytes(match[2])
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('invalid_saved_post_media')
  return `data:${match[1] === 'image/jpg' ? 'image/jpeg' : match[1]};base64,${match[2]}`
}

/** Native preview file extensions can be fallbacks. Identify the stored bytes themselves. */
export async function readSocialImageFile(uri: string, readBase64: (uri: string) => Promise<string>) {
  if (uri.startsWith('data:')) return normalizeSocialImage(uri)
  if (!uri.startsWith('file://')) throw new Error('invalid_saved_post_media')
  const base64 = await readBase64(uri)
  if (base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('invalid_saved_post_media')
  const bytes = base64ToBytes(base64)
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpeg'
    : ascii(0, 8) === '\x89PNG\r\n\x1a\n' ? 'png'
    : ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) ? 'gif'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'webp'
    : ascii(4, 8) === 'ftyp' && [8, 16, 20, 24, 28].some((start) => ['avif', 'avis'].includes(ascii(start, start + 4))) ? 'avif'
    : undefined
  if (!type) throw new Error('invalid_saved_post_media')
  return normalizeSocialImage(`data:image/${type};base64,${base64}`)
}

export const readSocialImage = async (uri: string) => normalizeSocialImage(uri)
