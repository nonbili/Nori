/**
 * The single source of truth for Nori's colors.
 *
 * Everything that needs a color reads it from here:
 *   - the three Tailwind configs (app, extension, desktop) take `colors`
 *   - lib/tokens.css is generated from the raw channels by `bun run tokens`
 *   - lib/accent.ts wraps ACCENT_RAMPS for the accent picker
 *   - lib/theme.ts resolves the handful of colors that have to be passed to
 *     native components as plain strings
 *
 * CommonJS because Tailwind configs `require` it; lib/design-tokens.d.ts gives
 * the TypeScript side its types. Channels are space-separated RGB so Tailwind's
 * `<alpha-value>` modifier keeps working (`bg-surface/70`).
 */

const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/**
 * Structural tokens, as [light, dark]. These flip with the color scheme, so a
 * component writes `bg-surface` once instead of `bg-white dark:bg-stone-900`.
 * Values are Tailwind's stone ramp unless noted.
 */
const STRUCTURAL = {
  /** Screen background. stone-50 / stone-950 */
  canvas: ['250 250 249', '12 10 9'],
  /** A card on the canvas. white / stone-900 */
  surface: ['255 255 255', '28 25 23'],
  /** A tile recessed into a card. white / stone-950 */
  inset: ['255 255 255', '12 10 9'],
  /** A recessed control sitting directly on the canvas. stone-100 / stone-950 */
  well: ['245 245 244', '12 10 9'],
  /** Quiet fill for icon buttons and chips. stone-200 / stone-800 */
  muted: ['231 229 228', '41 37 36'],
  /** Its pressed state. stone-300 / stone-700 */
  'muted-strong': ['214 211 209', '68 64 60'],
  /** Primary-button fill; pair with content-inverse. stone-900 / stone-100 */
  contrast: ['28 25 23', '245 245 244'],
  /** Hairline. stone-200 / stone-800 */
  line: ['231 229 228', '41 37 36'],
  /** The more visible hairline, for interactive edges. stone-300 / stone-700 */
  'line-strong': ['214 211 209', '68 64 60'],
  /** Body and title text. stone-900 / stone-100 */
  content: ['28 25 23', '245 245 244'],
  /** stone-700 / stone-300 */
  'content-secondary': ['68 64 60', '214 211 209'],
  /** stone-600 / stone-400 */
  'content-muted': ['87 83 78', '168 162 158'],
  /** stone-500 in both schemes. */
  'content-subtle': ['120 113 108', '120 113 108'],
  /** Text and icons drawn on `bg-contrast`. stone-50 / stone-950 */
  'content-inverse': ['250 250 249', '12 10 9'],
}

/**
 * The accent ramps a user can choose between, in picker order. Unlike the
 * structural tokens these do NOT flip with the scheme — components pick the
 * step they want with a `dark:` variant, which is what lets an accent swap be
 * one flat set of variable writes that survives a light/dark toggle.
 */
const ACCENT_RAMPS = {
  emerald: ['236 253 245', '209 250 229', '167 243 208', '110 231 183', '52 211 153', '16 185 129', '5 150 105', '4 120 87', '6 95 70', '6 78 59', '2 44 34'],
  teal: ['240 253 250', '204 251 241', '153 246 228', '94 234 212', '45 212 191', '20 184 166', '13 148 136', '15 118 110', '17 94 89', '19 78 74', '4 47 46'],
  sky: ['240 249 255', '224 242 254', '186 230 253', '125 211 252', '56 189 248', '14 165 233', '2 132 199', '3 105 161', '7 89 133', '12 74 110', '8 47 73'],
  indigo: ['238 242 255', '224 231 255', '199 210 254', '165 180 252', '129 140 248', '99 102 241', '79 70 229', '67 56 202', '55 48 163', '49 46 129', '30 27 75'],
  violet: ['245 243 255', '237 233 254', '221 214 254', '196 181 253', '167 139 250', '139 92 246', '124 58 237', '109 40 217', '91 33 182', '76 29 149', '46 16 101'],
  fuchsia: ['253 244 255', '250 232 255', '245 208 254', '240 171 252', '232 121 249', '217 70 239', '192 38 211', '162 28 175', '134 25 143', '112 26 117', '74 4 78'],
  rose: ['255 241 242', '255 228 230', '254 205 211', '253 164 175', '251 113 133', '244 63 94', '225 29 72', '190 18 60', '159 18 57', '136 19 55', '76 5 25'],
  amber: ['255 251 235', '254 243 199', '253 230 138', '252 211 77', '251 191 36', '245 158 11', '217 119 6', '180 83 9', '146 64 14', '120 53 15', '69 26 3'],
}

/** Not user-selectable: destructive actions should read the same everywhere. */
const DANGER_RAMP = ACCENT_RAMPS.rose

const DEFAULT_ACCENT = 'emerald'

const token = (name) => `rgb(var(--nori-${name}) / <alpha-value>)`

const rampColors = (name) =>
  Object.fromEntries(RAMP_STEPS.map((step) => [step, token(`${name}-${step}`)]))

/** The Tailwind `theme.extend.colors` map. Every entry is a CSS variable, which
 *  is what makes the accent swappable without rebuilding styles. */
const colors = {
  canvas: token('canvas'),
  surface: token('surface'),
  inset: token('inset'),
  well: token('well'),
  muted: { DEFAULT: token('muted'), strong: token('muted-strong') },
  contrast: token('contrast'),
  line: { DEFAULT: token('line'), strong: token('line-strong') },
  content: {
    DEFAULT: token('content'),
    secondary: token('content-secondary'),
    muted: token('content-muted'),
    subtle: token('content-subtle'),
    inverse: token('content-inverse'),
  },
  /** `on` is the foreground a solid accent fill can carry; a custom accent may
   *  be too light for white, so it is resolved at runtime by lib/accent.ts. */
  accent: { ...rampColors('accent'), on: token('accent-on') },
  danger: rampColors('danger'),
}

module.exports = {
  RAMP_STEPS,
  STRUCTURAL,
  ACCENT_RAMPS,
  DANGER_RAMP,
  DEFAULT_ACCENT,
  colors,
}
