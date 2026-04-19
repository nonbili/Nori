import * as WebBrowser from 'expo-web-browser'
import { isAuthCallbackUrl } from '@/lib/auth-callback'
import { supabaseAuth } from './client'

const AUTH_URL = 'https://nori.inks.page/auth/app'
const MANAGE_URL = 'https://nori.inks.page/app'

WebBrowser.maybeCompleteAuthSession()

export const signOut = async () => {
  await supabaseAuth.signOut({ scope: 'local' })
}

export const onReceiveAuthUrl = async (url: string) => {
  if (!isAuthCallbackUrl(url)) {
    return false
  }

  const token = url.match(/[?&]t=([^&]+)/)?.[1]
  if (!token) {
    return false
  }

  try {
    await WebBrowser.dismissBrowser()
  } catch {
    // ignore
  }

  await supabaseAuth.verifyOtp({
    token_hash: token,
    type: 'email',
  })
  return true
}

export const startHostedSignIn = async () => {
  const result = await WebBrowser.openAuthSessionAsync(AUTH_URL, 'nori:auth')
  if (result.type === 'success' && result.url) {
    await onReceiveAuthUrl(result.url)
  }
}

export const openManagePlan = async () => {
  await WebBrowser.openBrowserAsync(MANAGE_URL)
}
