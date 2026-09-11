/**
 * The colour maths behind custom accents.
 *
 * Generating a ramp from one user-picked colour means moving a hue around
 * without the lightness drifting, which sRGB cannot do: rotating hue in HSL
 * makes yellow read far lighter than blue at the same nominal lightness.
 * OKLab is perceptually uniform, so holding L fixed across a hue rotation
 * actually holds the *apparent* lightness fixed - which is what lets a
 * generated ramp keep the curve of a hand-tuned one.
 *
 * Deliberately dependency-free: this runs in the Expo app, the extension and
 * the Wails shell alike, and none of them should have to agree on a colour
 * library. Conversions follow Björn Ottosson's reference implementation.
 */

export interface Oklch {
  /** Perceptual lightness, 0-1. */
  l: number
  /** Chroma, 0 to ~0.4 in practice. */
  c: number
  /** Hue in degrees, 0-360. */
  h: number
}

/** sRGB as 0-255, matching how the token channels are stored. */
export interface Rgb {
  r: number
  g: number
  b: number
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

const toLinear = (channel: number) => {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const fromLinear = (value: number) => {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return clamp01(v) * 255
}

export const rgbToOklch = ({ r, g, b }: Rgb): Oklch => {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const hue = (Math.atan2(okB, okA) * 180) / Math.PI
  return {
    l: okL,
    c: Math.sqrt(okA * okA + okB * okB),
    h: hue < 0 ? hue + 360 : hue,
  }
}

/** Raw conversion, which may land outside sRGB; use {@link oklchToRgb} instead. */
const oklchToRgbUnclamped = ({ l, c, h }: Oklch): { r: number; g: number; b: number; inGamut: boolean } => {
  const radians = (h * Math.PI) / 180
  const okA = c * Math.cos(radians)
  const okB = c * Math.sin(radians)

  const lCube = (l + 0.3963377774 * okA + 0.2158037573 * okB) ** 3
  const mCube = (l - 0.1055613458 * okA - 0.0638541728 * okB) ** 3
  const sCube = (l - 0.0894841775 * okA - 1.291485548 * okB) ** 3

  const lr = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube
  const lg = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube
  const lb = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube

  // A hair of slack, so rounding alone never reads as out of gamut.
  const epsilon = 1e-4
  const inGamut = [lr, lg, lb].every((channel) => channel >= -epsilon && channel <= 1 + epsilon)
  return { r: fromLinear(lr), g: fromLinear(lg), b: fromLinear(lb), inGamut }
}

/**
 * Converts to sRGB, trading chroma away until the colour fits.
 *
 * Every hue runs out of gamut at a different chroma - sRGB holds far more
 * saturated blues than yellows - so a generated ramp that kept a fixed chroma
 * would clip, and clipping shifts hue. Bisecting on chroma instead keeps the
 * hue and lightness the ramp was built around and only gives up saturation.
 */
export const oklchToRgb = (color: Oklch): Rgb => {
  const direct = oklchToRgbUnclamped(color)
  if (direct.inGamut) return { r: direct.r, g: direct.g, b: direct.b }

  let low = 0
  let high = color.c
  let best = oklchToRgbUnclamped({ ...color, c: 0 })
  // 12 halvings resolve chroma far finer than an 8-bit channel can show.
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2
    const candidate = oklchToRgbUnclamped({ ...color, c: mid })
    if (candidate.inGamut) {
      best = candidate
      low = mid
    } else {
      high = mid
    }
  }
  return { r: best.r, g: best.g, b: best.b }
}

/**
 * The most chroma sRGB can hold at a given lightness and hue.
 *
 * The accent picker's intensity strip needs this: sRGB's limit swings widely
 * with hue, so a strip that ran to a fixed maximum would spend its top half
 * doing nothing for yellows while clipping blues.
 */
export const maxChroma = (l: number, h: number): number => {
  let low = 0
  // Past this no sRGB colour survives at any hue, so it is a safe upper bound.
  let high = 0.4
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2
    if (oklchToRgbUnclamped({ l, c: mid, h }).inGamut) low = mid
    else high = mid
  }
  return low
}

/** `"r g b"`, the space-separated form the design tokens are stored in. */
export const rgbToChannels = ({ r, g, b }: Rgb): string =>
  `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`

export const channelsToRgb = (channels: string): Rgb => {
  const [r = 0, g = 0, b = 0] = channels.trim().split(/\s+/).map(Number)
  return { r, g, b }
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#rgb` / `#rrggbb`, returning null for anything else. */
export const hexToRgb = (hex: string): Rgb | null => {
  const match = HEX_PATTERN.exec(hex.trim())
  if (!match) return null
  const digits = match[1]!
  const full = digits.length === 3 ? digits.split('').map((d) => d + d).join('') : digits
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

/** WCAG relative luminance, for deciding what text an accent fill can carry. */
export const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}
