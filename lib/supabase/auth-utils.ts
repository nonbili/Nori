const DELETE_ACCOUNT_URL = 'https://nori.inks.page/auth/app/delete-account'

export function getAuthCallbackToken(url: string) {
  return url.match(/[?&]t=([^&]+)/)?.[1] || ''
}

export function buildDeleteAccountUrl(token?: string | null) {
  return token ? `${DELETE_ACCOUNT_URL}?t=${encodeURIComponent(token)}` : DELETE_ACCOUNT_URL
}
