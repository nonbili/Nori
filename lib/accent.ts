import { ACCENT_RAMPS, DEFAULT_ACCENT, RAMP_STEPS, type AccentName, type RampStep } from '@/lib/design-tokens'

/**
 * The user-selectable accent, on top of the ramps in lib/design-tokens.js.
 *
 * Applying an accent means overriding the `--nori-accent-*` variables that
 * lib/tokens.css declares. Because those are scheme-independent, one flat set
 * of writes covers both light and dark, and nothing has to be redone when the
 * scheme flips.
 */

export type AccentId = AccentName

export const ACCENT_IDS = Object.keys(ACCENT_RAMPS) as AccentId[]

export { DEFAULT_ACCENT }

export const isAccentId = (value: unknown): value is AccentId =>
  typeof value === 'string' && value in ACCENT_RAMPS

export const normalizeAccent = (value: unknown): AccentId => (isAccentId(value) ? value : DEFAULT_ACCENT)

/** CSS custom properties for one accent, keyed as lib/tokens.css declares them. */
export const accentVariables = (accent: AccentId): Record<string, string> =>
  Object.fromEntries(
    RAMP_STEPS.map((step, index) => [`--nori-accent-${step}`, ACCENT_RAMPS[normalizeAccent(accent)][index]!]),
  )

/**
 * Writes the accent onto the document root.
 *
 * Wherever the DOM cascade is what resolves the variables, setting them on a
 * React subtree is not enough: react-native-web portals modals into
 * document.body (see ModalPortal), so anything inline on a root View stops at
 * the modal boundary and the sheet falls back to the default accent from
 * lib/tokens.css. No-op where there is no document.
 */
export const applyAccentToDocument = (accent: AccentId): void => {
  if (typeof document === 'undefined') return
  for (const [name, channels] of Object.entries(accentVariables(accent))) {
    document.documentElement.style.setProperty(name, channels)
  }
}

/** One step as raw `r g b` channels, for feeding a CSS variable directly. */
export const accentChannels = (accent: AccentId, step: RampStep): string =>
  ACCENT_RAMPS[normalizeAccent(accent)][RAMP_STEPS.indexOf(step)]!

/** One step as `rgb(r, g, b)`, for colors that must be passed to native props. */
export const accentColor = (accent: AccentId, step: RampStep): string =>
  `rgb(${accentChannels(accent, step).split(' ').join(', ')})`
