import { parseHttpUrl } from './url'

export type PreviewSource = 'page-image' | 'screenshot'
export class PreviewResponseError extends Error {
  constructor(
    message: string,
    public persistent: boolean,
    public status?: number,
  ) {
    super(message)
  }
}
export function persistentPreviewStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}
// Statuses bot protection (DataDome, Cloudflare, ...) gives a plain fetch for a
// page that a real browser engine can usually still load.
export function blockedPreviewStatus(status?: number) {
  return status === 401 || status === 403 || status === 406 || status === 429 || status === 503
}
export interface BookmarkPreview {
  description: string
  imageUrl: string
  imageUri: string
  savedAt: number
  retryAfter?: number
}
export function previewSource(value: unknown, fallback: PreviewSource = 'page-image'): PreviewSource {
  return value === 'page-image' || value === 'screenshot' ? value : fallback
}
export function previewKey(url: string, source: PreviewSource) {
  return `${source}:${parseHttpUrl(url).href}`
}

// Height of the fullest preview tile, for the reorder grid's uniform rows: a
// 1px border and the taller of the image, which fills the tile at 80px plus the
// p-4 it replaces, and the p-4 padded text column
// (domain row, two text-sm title lines, two text-xs description lines, and two
// gap-2 gaps). `rem` is 16 on web but 14 under NativeWind on native.
export function previewHeight(fontScale: number, systemFontScale = 1, rem = 16) {
  const line = rem * fontScale * systemFontScale
  return Math.ceil(2 + 2 * rem + Math.max(80, Math.max(18, line) + rem + 4.5 * line))
}

export function previewSourceOverride(value: unknown): PreviewSource | undefined {
  return value === 'page-image' || value === 'screenshot' ? value : undefined
}
