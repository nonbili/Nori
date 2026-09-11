/** Types for lib/design-tokens.js, which stays CommonJS so Tailwind can require it. */

export type RampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950

/** Eleven space-separated RGB channel triplets, one per RAMP_STEPS entry. */
export type Ramp = readonly string[]

/** [light, dark] channels for a token that flips with the color scheme. */
export type StructuralToken = readonly [string, string]

export type StructuralTokenName =
  | 'canvas'
  | 'surface'
  | 'inset'
  | 'well'
  | 'muted'
  | 'muted-strong'
  | 'contrast'
  | 'line'
  | 'line-strong'
  | 'content'
  | 'content-secondary'
  | 'content-muted'
  | 'content-subtle'
  | 'content-inverse'

/** The curated ramps; a user may also pick any colour, see lib/accent.ts. */
export type AccentName = 'emerald' | 'teal' | 'sky' | 'indigo' | 'violet' | 'fuchsia' | 'rose' | 'amber'

export declare const RAMP_STEPS: readonly RampStep[]
export declare const STRUCTURAL: Readonly<Record<StructuralTokenName, StructuralToken>>
export declare const ACCENT_RAMPS: Readonly<Record<AccentName, Ramp>>
export declare const DANGER_RAMP: Ramp
export declare const DEFAULT_ACCENT: AccentName
export declare const colors: Record<string, unknown>
