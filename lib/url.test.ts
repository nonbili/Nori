import { describe, expect, it } from 'bun:test'
import { normalizeUrlInput, parseHttpUrl } from './url'

describe('url helpers', () => {
  it('normalizes bare domains to https urls', () => {
    expect(normalizeUrlInput(' example.com/path ')).toBe('https://example.com/path')
  })

  it('keeps existing schemes unchanged', () => {
    expect(normalizeUrlInput('http://example.com')).toBe('http://example.com')
    expect(normalizeUrlInput('mailto:test@example.com')).toBe('mailto:test@example.com')
  })

  it('returns an empty string for blank input', () => {
    expect(normalizeUrlInput('   ')).toBe('')
  })

  it('parses only http and https urls', () => {
    expect(parseHttpUrl('example.com').href).toBe('https://example.com/')
    expect(parseHttpUrl('http://example.com').href).toBe('http://example.com/')
    expect(() => parseHttpUrl('mailto:test@example.com')).toThrow('invalid_protocol')
  })
})
