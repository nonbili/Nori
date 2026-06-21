import { describe, expect, it } from 'bun:test'
import { buildDeleteAccountUrl, getAuthCallbackToken } from './auth-utils'

describe('supabase auth utils', () => {
  it('extracts auth callback token parameters', () => {
    expect(getAuthCallbackToken('nori:auth?t=abc')).toBe('abc')
    expect(getAuthCallbackToken('nori://auth?next=1&t=abc&done=1')).toBe('abc')
    expect(getAuthCallbackToken('nori://auth?next=1')).toBe('')
  })

  it('builds delete account urls with encoded tokens', () => {
    expect(buildDeleteAccountUrl()).toBe('https://nori.inks.page/auth/app/delete-account')
    expect(buildDeleteAccountUrl('a b+c')).toBe('https://nori.inks.page/auth/app/delete-account?t=a%20b%2Bc')
  })
})
