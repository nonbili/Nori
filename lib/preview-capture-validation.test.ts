import { describe, expect, it } from 'bun:test'
import { isBlankPreviewCapture } from './preview-capture-validation'

describe('screenshot pixel validation', () => {
  it('rejects uniform white, black and transparent captures', () => {
    for (const pixel of ['\xff\xff\xff\xff', '\x00\x00\x00\xff', '\x00\x00\x00\x00']) {
      expect(isBlankPreviewCapture(`4:4|${btoa(pixel.repeat(16))}`)).toBe(true)
    }
  })
  it('ignores an anomalous edge pixel on an otherwise blank capture', () => {
    const pixels = '\x00\x00\x00\x00' + '\xff\xff\xff\xff'.repeat(15)
    expect(isBlankPreviewCapture(`4:4|${btoa(pixels)}`)).toBe(true)
  })
  it('accepts rendered content and rejects truncated capture results', () => {
    const pixels = '\xff\xff\xff\xff'.repeat(8) + '\x12\x44\x55\xff'.repeat(8)
    expect(isBlankPreviewCapture(`4:4|${btoa(pixels)}`)).toBe(false)
    expect(() => isBlankPreviewCapture('4:4|AAAA')).toThrow('invalid_preview_pixels')
  })
})
