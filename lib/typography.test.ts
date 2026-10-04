import { describe, expect, test } from 'bun:test'
import { fontFamilyForPlatform, normalizeFontFamily, normalizeFontScale } from './typography'

describe('persisted typography settings', () => {
  test('old and malformed settings fall back to defaults', () => {
    for (const value of [undefined, null, '1.2', {}, [], NaN, Infinity, -Infinity]) {
      expect(normalizeFontScale(value)).toBe(1)
    }
    for (const value of [undefined, null, '', 'Georgia', 'SERIF', 1, {}, []]) {
      expect(normalizeFontFamily(value)).toBe('system')
    }
  })

  test('finite scales stay within the supported range and remove floating-point drift', () => {
    expect(normalizeFontScale(-1)).toBe(0.8)
    expect(normalizeFontScale(0)).toBe(0.8)
    expect(normalizeFontScale(10)).toBe(1.6)
    expect(normalizeFontScale(1.0500000000000003)).toBe(1.05)
    expect(normalizeFontScale(1.237)).toBe(1.24)
    expect(normalizeFontScale(0.8)).toBe(0.8)
    expect(normalizeFontScale(1.6)).toBe(1.6)
  })

  test('supported stored families resolve to fonts available on each platform', () => {
    for (const family of ['system', 'serif', 'monospace'] as const) {
      expect(normalizeFontFamily(family)).toBe(family)
    }
    expect(fontFamilyForPlatform('system', 'android')).toBeUndefined()
    expect(fontFamilyForPlatform('system', 'ios')).toBeUndefined()
    expect(fontFamilyForPlatform('system', 'web')).toBe('Inter Variable')
    expect(fontFamilyForPlatform('serif', 'ios')).toBe('Georgia')
    expect(fontFamilyForPlatform('monospace', 'ios')).toBe('Menlo')
    for (const platform of ['android', 'web']) {
      expect(fontFamilyForPlatform('serif', platform)).toBe('serif')
      expect(fontFamilyForPlatform('monospace', platform)).toBe('monospace')
    }
  })
})
