import { useColorScheme } from 'nativewind'
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { DANGER_RAMP, RAMP_STEPS, STRUCTURAL, type RampStep, type StructuralTokenName } from '@/lib/design-tokens'
import { accentColor, normalizeAccent, onAccentColor, type AccentId } from '@/lib/accent'
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

const structural = (name: StructuralTokenName, scheme: ColorScheme) =>
  rgb(STRUCTURAL[name][scheme === 'dark' ? 1 : 0])

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
  /** A solid accent fill, matching the `bg-accent-600` buttons. */
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
  const scheme = nativeWindScheme ?? rnScheme
  return scheme === 'dark' ? 'dark' : 'light'
}

export const getThemeColors = (
  colorScheme: ColorScheme | null | undefined,
  accent: AccentId,
): ThemeColors => {
  const scheme: ColorScheme = (colorScheme ?? Appearance.getColorScheme()) === 'dark' ? 'dark' : 'light'
  const isDark = scheme === 'dark'
  const token = (name: StructuralTokenName) => structural(name, scheme)

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
    accentFill: accentColor(accent, 600),
    onAccent: onAccentColor(accent),
    danger: danger(isDark ? 400 : 600),
  }
}

export const useThemeColors = (): ThemeColors => {
  const colorScheme = useAppColorScheme()
  const accent = useValue(settings$.accent)
  return getThemeColors(colorScheme, normalizeAccent(accent))
}
