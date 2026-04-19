const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export function normalizeUrlInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (URL_SCHEME_PATTERN.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

export function parseHttpUrl(value: string) {
  const normalized = normalizeUrlInput(value)
  const parsed = new URL(normalized)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('invalid_protocol')
  }
  return parsed
}
