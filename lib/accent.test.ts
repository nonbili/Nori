import { afterEach, describe, expect, test } from 'bun:test'
import { ACCENT_RAMPS, STRUCTURAL } from '@/lib/design-tokens'
import { accentRamp, accentVariables, normalizeAccent, structuralChannels } from '@/lib/accent'
import { systemPalette$, type SystemPalette } from '@/lib/system-palette'

const palette: SystemPalette = {
  accent: '#3366cc',
  structural: Object.fromEntries(
    Object.keys(STRUCTURAL).map((name) => [name, ['1 2 3', '4 5 6']]),
  ) as unknown as SystemPalette['structural'],
}

afterEach(() => systemPalette$.set(null))

describe('system accent', () => {
  test('is a stored word, not a colour', () => {
    expect(normalizeAccent('system')).toBe('system')
  })

  test('falls back to the default accent and stone without a palette', () => {
    expect(accentRamp('system')).toEqual(ACCENT_RAMPS.emerald)
    expect(structuralChannels('canvas', 'dark', 'system')).toBe(STRUCTURAL.canvas[1])
    expect(accentVariables('system', 'light')['--nori-canvas']).toBe(STRUCTURAL.canvas[0])
  })

  test('takes its ramp and structural tokens from the wallpaper palette', () => {
    systemPalette$.set(palette)
    expect(accentRamp('system')).toEqual(accentRamp('#3366cc'))
    expect(structuralChannels('canvas', 'light', 'system')).toBe('1 2 3')
    expect(structuralChannels('canvas', 'dark', 'system')).toBe('4 5 6')
    expect(accentVariables('system', 'dark')['--nori-surface']).toBe('4 5 6')
  })

  test('leaves other accents on stone even when a palette exists', () => {
    systemPalette$.set(palette)
    expect(structuralChannels('canvas', 'light', 'teal')).toBe(STRUCTURAL.canvas[0])
    expect(accentVariables('teal', 'light')['--nori-canvas']).toBe(STRUCTURAL.canvas[0])
  })
})


describe('AMOLED theme', () => {
  test('keeps the canvas black and elevated backgrounds distinct with a wallpaper palette', () => {
    systemPalette$.set(palette)
    const variables = accentVariables('system', 'dark', true)
    expect(variables['--nori-canvas']).toBe('0 0 0')
    for (const name of ['surface', 'inset', 'well'] as const) {
      expect(variables[`--nori-${name}`]).toBe(STRUCTURAL[name][1])
      expect(variables[`--nori-${name}`]).not.toBe(variables['--nori-canvas'])
    }
    expect(variables['--nori-well']).not.toBe(variables['--nori-surface'])
    expect(variables['--nori-content']).toBe('4 5 6')
    expect(variables['--nori-accent-fill']).toBe(accentVariables('system', 'dark')['--nori-accent-fill'])
  })

  test('restores every background when switching back to normal themes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const variables = accentVariables('teal', scheme)
      for (const name of ['canvas', 'surface', 'inset', 'well'] as const) {
        expect(variables[`--nori-${name}`]).toBe(STRUCTURAL[name][scheme === 'dark' ? 1 : 0])
      }
    }
  })
})
