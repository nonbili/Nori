export function isAuthCallbackUrl(url: string) {
  if (url.startsWith('nori:auth')) {
    return true
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol.toLowerCase() === 'nori:' && parsed.hostname.toLowerCase() === 'auth'
  } catch {
    return false
  }
}
