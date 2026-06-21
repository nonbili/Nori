import { describe, expect, it } from 'bun:test'
import { isAuthCallbackUrl } from './auth-callback'

describe('auth callback urls', () => {
  it('accepts nori auth callback urls', () => {
    expect(isAuthCallbackUrl('nori:auth')).toBe(true)
    expect(isAuthCallbackUrl('nori:auth?code=abc')).toBe(true)
    expect(isAuthCallbackUrl('nori://auth?code=abc')).toBe(true)
    expect(isAuthCallbackUrl('NORI://AUTH?code=abc')).toBe(true)
  })

  it('rejects non-auth or malformed urls', () => {
    expect(isAuthCallbackUrl('nori://settings')).toBe(false)
    expect(isAuthCallbackUrl('https://example.com/auth')).toBe(false)
    expect(isAuthCallbackUrl('not a url')).toBe(false)
  })
})
