import { Platform } from 'react-native'
import type { TFunction } from 'i18next'
import { ui$ } from '@/states/ui'
import { canCaptureFromPage } from './social-post-capture'
import { saveSocialPostHere } from './social-post-autosave'
import { socialTarget } from './social-post'
import { showToast } from './toast'

/** A refresh refused because it came back with less than the copy already saved. */
export const isIncompleteSave = (error: unknown) => error instanceof Error && error.message === 'social_post_incomplete'

/**
 * Saves or refreshes the post at `url`. A site that refuses a plain fetch gets its page opened to
 * save from instead, signed in if need be, as long as `isCurrent` still holds. A copy already saved
 * is never replaced by less.
 */
export async function saveSocialPostOrCapture(url: string, t: TFunction, { refresh = false, isCurrent = () => true }: { refresh?: boolean; isCurrent?: () => boolean } = {}) {
  try {
    await saveSocialPostHere(url)
    showToast(t(refresh ? 'socialPost.refreshed' : 'socialPost.saved'))
  } catch (error) {
    // Stopped on purpose by a sign-in or sign-out: nothing failed, and the page is for another account now.
    if (error instanceof Error && error.message === 'social_account_changed') return
    if (isIncompleteSave(error)) showToast(t('socialPost.keptSaved'))
    // Only while what asked is still on screen: a late failure must not open a page over something else.
    else if (Platform.OS !== 'web' && canCaptureFromPage(socialTarget(url)) && isCurrent()) ui$.socialCapture.set({ url })
    else showToast(t('socialPost.failed'))
  }
}

