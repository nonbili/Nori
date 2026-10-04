import { useColorScheme } from 'nativewind'
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { DANGER_RAMP, RAMP_STEPS, type RampStep, type StructuralTokenName } from '@/lib/design-tokens'
import {
  accentColor,
  accentFillColor,
  normalizeAccent,
  onAccentColor,
  structuralChannels,
  type AccentId,
} from '@/lib/accent'
import { systemPalette$ } from '@/lib/system-palette'
import { settings$ } from '@/states/settings'

/**
 * The design tokens, resolved to plain color strings.
 *
 * Styling goes through Tailwind classes (`bg-surface`, `text-content-muted`),
 * which read the CSS variables directly. This module is for the places that
 * cannot: native props like MaterialIcons' `color` or `placeholderTextColor`,
 * and animated styles driven from a worklet. Both sides read the same values,
 * so a token only ever has to be changed in lib/design-tokens.js.
 */

type ColorScheme = 'light' | 'dark'

/** Channels are stored space-separated for Tailwind; native props want rgb(). */
const rgb = (channels: string) => `rgb(${channels.split(' ').join(', ')})`


const danger = (step: RampStep) => rgb(DANGER_RAMP[RAMP_STEPS.indexOf(step)]!)

export interface ThemeColors {
  canvas: string
  surface: string
  inset: string
  muted: string
  mutedStrong: string
  contrast: string
  line: string
  lineStrong: string
  content: string
  contentSecondary: string
  contentMuted: string
  contentSubtle: string
  /** For anything drawn on `contrast`. */
  contentInverse: string
  /** Readable on canvas, surface and an accent tint alike. */
  accent: string
  /** A solid accent fill, matching the `bg-accent-fill` buttons. Unlike the
   *  ramp steps this one does flip with the scheme, so a near-black accent
   *  still reads as a fill on the dark canvas - see lib/accent.ts. */
  accentFill: string
  /** For anything drawn on `accentFill`. The accent ramps do not flip with the
   *  scheme, so this never follows `contentInverse`; it is white for every
   *  preset and for almost every custom accent, and goes dark only where white
   *  would not read - see onAccentChannels in lib/accent.ts. */
  onAccent: string
  danger: string
}

export const useAppColorScheme = (): ColorScheme => {
  const { colorScheme: nativeWindScheme } = useColorScheme()
  const rnScheme = useRNColorScheme()
  const theme = useValue(settings$.theme)
  const scheme = theme === 'amoled' ? 'dark' : theme ?? nativeWindScheme ?? rnScheme
  return scheme === 'dark' ? 'dark' : 'light'
}

export const getThemeColors = (
  colorScheme: ColorScheme | null | undefined,
  accent: AccentId,
  amoled = false,
): ThemeColors => {
  const scheme: ColorScheme = (colorScheme ?? Appearance.getColorScheme()) === 'dark' ? 'dark' : 'light'
  const isDark = scheme === 'dark'
  const token = (name: StructuralTokenName) => rgb(structuralChannels(name, scheme, accent, amoled))

  return {
    canvas: token('canvas'),
    surface: token('surface'),
    inset: token('inset'),
    muted: token('muted'),
    mutedStrong: token('muted-strong'),
    contrast: token('contrast'),
    line: token('line'),
    lineStrong: token('line-strong'),
    content: token('content'),
    contentSecondary: token('content-secondary'),
    contentMuted: token('content-muted'),
    contentSubtle: token('content-subtle'),
    contentInverse: token('content-inverse'),
    // Mirrors what the classNames pick for accent text.
    accent: accentColor(accent, isDark ? 300 : 700),
    accentFill: accentFillColor(accent, scheme),
    onAccent: onAccentColor(accent, scheme),
    danger: danger(isDark ? 400 : 600),
  }
}

export const useThemeColors = (): ThemeColors => {
  const colorScheme = useAppColorScheme()
  const accent = useValue(settings$.accent)
  const amoled = useValue(settings$.theme) === 'amoled'
  // The System accent reads the wallpaper palette, which can arrive or change
  // without the setting moving.
  useValue(systemPalette$)
  return getThemeColors(colorScheme, normalizeAccent(accent), amoled)
}
