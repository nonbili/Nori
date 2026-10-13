import { describe, expect, it } from 'bun:test'
import { getUserAgent } from './useragent'

describe('getUserAgent', () => {
  it('claims Chrome on Android and a desktop Mac for desktop mode on iOS', () => {
    expect(getUserAgent('android')).toContain('Linux; Android 10; K')
    expect(getUserAgent('android')).toContain(' Mobile Safari/')
    expect(getUserAgent('ios', true)).toContain('Macintosh')
    expect(getUserAgent('ios', true)).not.toContain(' Mobile ')
  })

  it('uses CriOS for mobile iOS only', () => {
    expect(getUserAgent('ios')).toContain('CriOS/')
    expect(getUserAgent('ios', true)).toContain('Chrome/')
  })
})
