import { getMaterialColors, isDynamicColorAvailable } from '@expo/ui/jetpack-compose'
import { Hct, TonalPalette, argbFromHex, hexFromArgb } from '@material/material-color-utilities'
import { STRUCTURAL, type StructuralTokenName } from './design-tokens'
import type { SystemPalette } from './system-palette'

export { isDynamicColorAvailable }

// Material You expands the wallpaper's source color into tonal palettes: one hue
// and chroma, any tone (lightness). The structural tokens are Tailwind stone, a
// tonal scale too, so each keeps its own tone and takes the hue and chroma of
// the wallpaper's neutral palette. Accents are not remapped here: the primary
// color goes through the same ramp generation as a picked custom color.

// Stone's dark end is near black and its light end near white, which reads harsh
// once tinted. In dark mode, move tones onto Material's dark scheme instead:
// stone-950 lands on surface, stone-900 on surfaceContainer, stone-800 on
// surfaceContainerHighest, stone-100 on onSurface and stone-300 on
// onSurfaceVariant. [stone tone, Material tone], ascending.
const darkTones: [number, number][] = [
  [0, 4],
  [2.5, 6],
  [8.4, 12],
  [15.7, 22],
  [26.9, 30],
  [47.9, 50],
  [85, 80],
  [96.2, 90],
  [100, 98],
]

const remapTone = (tone: number, anchors: [number, number][]) => {
  const i = anchors.findIndex(([from]) => from >= tone)
  if (i <= 0) {
    return anchors[Math.max(i, 0)][1]
  }
  const [x0, y0] = anchors[i - 1]
  const [x1, y1] = anchors[i]
  return y0 + ((tone - x0) * (y1 - y0)) / (x1 - x0)
}

const toneOf = (channels: string) => {
  const [r, g, b] = channels.split(' ').map(Number)
  return Hct.fromInt(((255 << 24) | (r << 16) | (g << 8) | b) >>> 0).tone
}

const channelsOf = (argb: number) => [(argb >> 16) & 255, (argb >> 8) & 255, argb & 255].join(' ')

// The palette comes back as #RRGGBBAA.
const toArgb = (rgba: string) => argbFromHex(rgba.slice(0, 7))

export const readSystemPalette = (): SystemPalette | null => {
  if (!isDynamicColorAvailable) {
    return null
  }
  let scheme
  try {
    scheme = getMaterialColors({ scheme: 'light' })
  } catch (e) {
    console.error(e)
    return null
  }
  const neutral = TonalPalette.fromInt(toArgb(scheme.surfaceContainerHighest))
  const structural = {} as SystemPalette['structural']
  for (const name of Object.keys(STRUCTURAL) as StructuralTokenName[]) {
    const [light, dark] = STRUCTURAL[name]
    structural[name] = [
      channelsOf(neutral.tone(toneOf(light))),
      channelsOf(neutral.tone(remapTone(toneOf(dark), darkTones))),
    ]
  }
  return { accent: hexFromArgb(toArgb(scheme.primary)) as `#${string}`, structural }
}
