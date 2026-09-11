import { ACCENT_RAMPS, DEFAULT_ACCENT, RAMP_STEPS, STRUCTURAL, type AccentName, type RampStep } from '@/lib/design-tokens'
import {
  channelsToRgb,
  contrastRatio,
  hexToRgb,
  maxChroma,
  oklchToRgb,
  rgbToChannels,
  rgbToHex,
  rgbToOklch,
  type Rgb,
} from '@/lib/oklch'

/**
 * The user-selectable accent, on top of the ramps in lib/design-tokens.js.
 *
 * An accent is either one of the curated ramps by name, or any colour the user
 * picked, stored as a hex string and expanded into a ramp at runtime (see
 * {@link generateRamp}). Applying one means overriding the `--nori-accent-*`
 * variables that lib/tokens.css declares. Because those are scheme-independent,
 * one flat set of writes covers both light and dark, and nothing has to be
 * redone when the scheme flips.
 */

/** A colour the user picked, normalised to lowercase `#rrggbb`. */
export type CustomAccent = `#${string}`

export type AccentId = AccentName | CustomAccent

/** Which color scheme an accent is being resolved for. */
export type AccentScheme = 'light' | 'dark'

export const ACCENT_IDS = Object.keys(ACCENT_RAMPS) as AccentName[]

export { DEFAULT_ACCENT }

export const isPresetAccent = (value: unknown): value is AccentName =>
  typeof value === 'string' && value in ACCENT_RAMPS

export const isCustomAccent = (value: unknown): value is CustomAccent =>
  typeof value === 'string' && value.startsWith('#') && hexToRgb(value) !== null

export const isAccentId = (value: unknown): value is AccentId =>
  isPresetAccent(value) || isCustomAccent(value)

/**
 * Coerces stored or bridged input to a usable accent.
 *
 * Custom accents arrive from persisted preferences and from the extension's
 * state bridge, so this is the one gate that keeps an arbitrary string out of
 * the token writes - and it normalises `#ABC` spellings to `#aabbcc` so the
 * ramp cache and the picker's selected check agree on one form.
 */
export const normalizeAccent = (value: unknown): AccentId => {
  if (isPresetAccent(value)) return value
  if (typeof value === 'string') {
    const rgb = hexToRgb(value)
    if (rgb) return rgbToHex(rgb) as CustomAccent
  }
  return DEFAULT_ACCENT
}

/**
 * The lightness a picked colour is stored at.
 *
 * A custom accent contributes a hue and a chroma, never a lightness - the ramp
 * takes its lightness curve from a curated preset (see {@link generateRamp}) -
 * so pinning the stored colour here is what keeps the picker honest: the swatch,
 * the hex field and the fill you end up with are all the same colour.
 */
export const PICKED_LIGHTNESS = 0.6

/** A colour to store for a picked hue and chroma. */
export const accentHexFor = (hue: number, chroma: number): CustomAccent =>
  rgbToHex(oklchToRgb({ l: PICKED_LIGHTNESS, c: chroma, h: hue })) as CustomAccent

/** One hue at the picking lightness, just short of the gamut edge. */
export const hueColor = (hue: number): string =>
  rgbToHex(oklchToRgb({ l: PICKED_LIGHTNESS, c: maxChroma(PICKED_LIGHTNESS, hue) * 0.9, h: hue }))

const ANCHOR_INDEX = RAMP_STEPS.indexOf(600)

/** Below this chroma a colour is a neutral, not a hue. */
const NEUTRAL_CHROMA = 0.015

/**
 * The curated ramps in OKLCH, which is where a generated ramp gets its shape.
 *
 * The neutral preset is excluded: its hue is rounding noise, so it would be
 * the nearest reference for an arbitrary slice of the wheel, and its flat
 * chroma curve would then turn a perfectly colourful pick into a grey ramp.
 */
const referenceRamps = ACCENT_IDS.map((name) => ({
  name,
  steps: ACCENT_RAMPS[name].map((channels) => rgbToOklch(channelsToRgb(channels))),
})).filter((ramp) => ramp.steps[ANCHOR_INDEX]!.c >= NEUTRAL_CHROMA)

/**
 * The contrast white has to clear on an accent fill to stay the foreground.
 *
 * WCAG's 3:1 floor for UI components and large text is the right bar here -
 * accent fills only ever carry icons and short semibold labels - and it is
 * also what keeps the curated presets looking as they always have: emerald,
 * teal and amber land between 3.1 and 3.8 against white, so a plain
 * best-contrast rule would flip three shipped accents to dark text.
 */
const MIN_ON_ACCENT_CONTRAST = 3

const hueDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Generates an eleven-step ramp from one colour.
 *
 * The lightness and chroma curve is borrowed from whichever curated ramp sits
 * closest in hue, rather than computed from scratch: Tailwind's ramps are not
 * a pure hue rotation of one another - chroma peaks at a different lightness
 * for yellow than for blue - so reusing a neighbour's curve is what keeps a
 * generated ramp looking like it belongs beside the presets.
 *
 * The picked colour sets the hue, and scales the curve's chroma, so a muted
 * choice yields a muted ramp. It does not set the lightness of any step: an
 * accent has to work as a 600 fill under white text and as a 50 tint behind
 * body copy, which a single user-chosen lightness cannot do. The picker shows
 * the generated 600 so what lands in the UI is what the swatch showed.
 */
const generateRamp = (hex: CustomAccent): string[] => {
  const rgb = hexToRgb(hex) ?? channelsToRgb(ACCENT_RAMPS[DEFAULT_ACCENT][ANCHOR_INDEX]!)
  const { h, c } = rgbToOklch(rgb)

  const reference = referenceRamps.reduce((closest, candidate) =>
    hueDistance(candidate.steps[ANCHOR_INDEX]!.h, h) < hueDistance(closest.steps[ANCHOR_INDEX]!.h, h)
      ? candidate
      : closest,
  )

  // A grey, black or white pick has no meaningful hue - OKLCH reports an
  // arbitrary one - so honour the lack of chroma and generate a neutral ramp
  // rather than letting the floor below invent a colour out of rounding noise.
  const anchorChroma = reference.steps[ANCHOR_INDEX]!.c
  const rawScale = c / anchorChroma
  const chromaScale = c < NEUTRAL_CHROMA ? rawScale : Math.min(Math.max(rawScale, 0.35), 1.15)

  return reference.steps.map((step) =>
    rgbToChannels(oklchToRgb({ l: step.l, c: step.c * chromaScale, h })),
  )
}

/** Generation is pure, and the same accent is asked for on every render. */
const generatedRamps = new Map<string, string[]>()

/** The eleven steps of an accent, as `"r g b"` channels in RAMP_STEPS order. */
export const accentRamp = (accent: AccentId): readonly string[] => {
  const id = normalizeAccent(accent)
  if (isPresetAccent(id)) return ACCENT_RAMPS[id]
  const cached = generatedRamps.get(id)
  if (cached) return cached
  const ramp = generateRamp(id)
  generatedRamps.set(id, ramp)
  return ramp
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }

const FILL_INDEX = ANCHOR_INDEX
const PRESSED_INDEX = RAMP_STEPS.indexOf(700)
/** What stands in for 600 and 700 where those are too dark for the dark canvas. */
const DARK_FILL_INDEX = RAMP_STEPS.indexOf(100)
const DARK_PRESSED_INDEX = RAMP_STEPS.indexOf(200)

const DARK_CANVAS = channelsToRgb(STRUCTURAL.canvas[1])

/**
 * How far a fill has to separate from the dark canvas to still read as a fill.
 *
 * Every hued preset clears this comfortably - indigo, the darkest, sits at 2.5
 * - so this only ever catches an accent that is essentially black.
 */
const MIN_FILL_ON_DARK_CONTRAST = 2

/**
 * Whether an accent's fill has to be taken from the light end in dark mode.
 *
 * The ramps are scheme-independent on purpose, and components lean on that:
 * they pick the step that suits each scheme themselves (`text-accent-700
 * dark:text-accent-300`). A solid fill is the one thing they cannot do that
 * for, because its pressed state has to stay on the same side of the ramp -
 * so the near-black neutral accent, which is the old pre-accent chrome, would
 * otherwise be a black button on a near-black canvas. Deciding by contrast
 * rather than by name keeps this a property of the colour, so a dark enough
 * custom accent is covered too.
 */
const fillFlipsInDark = (accent: AccentId): boolean =>
  contrastRatio(channelsToRgb(accentRamp(accent)[FILL_INDEX]!), DARK_CANVAS) < MIN_FILL_ON_DARK_CONTRAST

/** The solid accent fill for one scheme, as `"r g b"`. */
export const accentFillChannels = (accent: AccentId, scheme: AccentScheme): string => {
  const ramp = accentRamp(accent)
  const flipped = scheme === 'dark' && fillFlipsInDark(accent)
  return ramp[flipped ? DARK_FILL_INDEX : FILL_INDEX]!
}

/** That fill's pressed state, as `"r g b"`. */
export const accentFillPressedChannels = (accent: AccentId, scheme: AccentScheme): string => {
  const ramp = accentRamp(accent)
  const flipped = scheme === 'dark' && fillFlipsInDark(accent)
  return ramp[flipped ? DARK_PRESSED_INDEX : PRESSED_INDEX]!
}

/**
 * What to draw on a solid accent fill, as `"r g b"`.
 *
 * White survives nearly every accent, generated ones included: a generated
 * ramp takes its lightness from a curated curve, so its 600 lands in the same
 * band the presets occupy rather than wherever the user's pick happened to
 * sit. The darkest-step fallback is a guard for the remainder - it makes the
 * foreground a checked consequence of the fill instead of an assumption that
 * happens to hold - and it is why anything on an accent fill reads the
 * `accent-on` token rather than a literal white.
 */
export const onAccentChannels = (accent: AccentId, scheme: AccentScheme): string => {
  const ramp = accentRamp(accent)
  const fill = channelsToRgb(accentFillChannels(accent, scheme))
  const dark = channelsToRgb(ramp[RAMP_STEPS.indexOf(950)]!)
  const onWhite = contrastRatio(fill, WHITE)
  if (onWhite >= MIN_ON_ACCENT_CONTRAST || onWhite >= contrastRatio(fill, dark)) return rgbToChannels(WHITE)
  return rgbToChannels(dark)
}

/** CSS custom properties for one accent, keyed as lib/tokens.css declares them. */
export const accentVariables = (accent: AccentId, scheme: AccentScheme): Record<string, string> => {
  const ramp = accentRamp(accent)
  return {
    ...Object.fromEntries(RAMP_STEPS.map((step, index) => [`--nori-accent-${step}`, ramp[index]!])),
    '--nori-accent-on': onAccentChannels(accent, scheme),
    '--nori-accent-fill': accentFillChannels(accent, scheme),
    '--nori-accent-fill-pressed': accentFillPressedChannels(accent, scheme),
  }
}

/**
 * Writes the accent onto the document root.
 *
 * Wherever the DOM cascade is what resolves the variables, setting them on a
 * React subtree is not enough: react-native-web portals modals into
 * document.body (see ModalPortal), so anything inline on a root View stops at
 * the modal boundary and the sheet falls back to the default accent from
 * lib/tokens.css. No-op where there is no document.
 */
export const applyAccentToDocument = (accent: AccentId, scheme: AccentScheme): void => {
  if (typeof document === 'undefined') return
  for (const [name, channels] of Object.entries(accentVariables(accent, scheme))) {
    document.documentElement.style.setProperty(name, channels)
  }
}

/** One step as raw `r g b` channels, for feeding a CSS variable directly. */
export const accentChannels = (accent: AccentId, step: RampStep): string =>
  accentRamp(accent)[RAMP_STEPS.indexOf(step)]!

/** One step as `rgb(r, g, b)`, for colors that must be passed to native props. */
export const accentColor = (accent: AccentId, step: RampStep): string =>
  `rgb(${accentChannels(accent, step).split(' ').join(', ')})`

/** The solid accent fill as `rgb()`; see {@link accentFillChannels}. */
export const accentFillColor = (accent: AccentId, scheme: AccentScheme): string =>
  `rgb(${accentFillChannels(accent, scheme).split(' ').join(', ')})`

/** `rgb()` for whatever reads on a solid accent fill; see {@link onAccentChannels}. */
export const onAccentColor = (accent: AccentId, scheme: AccentScheme): string =>
  `rgb(${onAccentChannels(accent, scheme).split(' ').join(', ')})`
