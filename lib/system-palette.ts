import { observable } from '@legendapp/state'
import type { StructuralTokenName } from '@/lib/design-tokens'

/**
 * What the wallpaper contributes to the "System" accent (Material You).
 *
 * `accent` is a `#rrggbb` whose hue and chroma seed the accent ramp, the same
 * way a picked custom colour does. `structural` re-tints every structural token
 * with the wallpaper's neutral palette, as [light, dark] `r g b` channels.
 * Computed by lib/dynamic-palette.android.ts; null everywhere else.
 */
export interface SystemPalette {
  accent: `#${string}`
  structural: Record<StructuralTokenName, readonly [string, string]>
}

/** Held in an observable so a wallpaper change repaints without a settings write. */
export const systemPalette$ = observable<SystemPalette | null>(null)
