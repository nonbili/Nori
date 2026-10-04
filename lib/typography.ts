export const FONT_FAMILIES = ['system', 'serif', 'monospace'] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]
export const MIN_FONT_SCALE = 0.8
export const MAX_FONT_SCALE = 1.6
export const FONT_SCALE_STEP = 0.05

export function normalizeFontScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, value)) * 100) / 100
    : 1
}

export function normalizeFontFamily(value: unknown): FontFamily {
  return FONT_FAMILIES.includes(value as FontFamily) ? (value as FontFamily) : 'system'
}

export function fontFamilyForPlatform(family: FontFamily, platform: string): string | undefined {
  if (family === 'serif') return platform === 'ios' ? 'Georgia' : 'serif'
  if (family === 'monospace') return platform === 'ios' ? 'Menlo' : 'monospace'
  return platform === 'web' ? 'Inter Variable' : undefined
}
