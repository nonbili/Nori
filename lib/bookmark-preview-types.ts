import { parseHttpUrl } from './url'

export type PreviewSource = 'page-image' | 'screenshot'
export class PreviewResponseError extends Error {
  constructor(
    message: string,
    public persistent: boolean,
  ) {
    super(message)
  }
}
export function persistentPreviewStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
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

export function previewHeight(fontScale: number, systemFontScale = 1) {
  return Math.ceil(48 + 100 * Math.max(1, fontScale * systemFontScale))
}

export function previewSourceOverride(value: unknown): PreviewSource | undefined {
  return value === 'page-image' || value === 'screenshot' ? value : undefined
}
