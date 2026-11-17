import { observable, when } from '@legendapp/state'
import { auth$ } from '@/states/auth'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { readPreview } from './bookmark-preview-storage'
import { isDeleted } from './nori-data'
import { saveSocialPost, storeSocialPost } from './saved-social-post'
import { socialKey, socialTarget, type SocialPost } from './social-post'
import { postRef, UNOWNED } from './social-post-sync'
import { getBookmarkUrlKey } from './bookmark-mutations'
import { getSyncGeneration, getSyncOwner, needsAccountChoice } from './supabase/sync-session'

/**
 * Who a capture made here belongs to: the account the device's data belongs to. That is the
 * signed-in account, except while the user has yet to choose what happens to another account's
 * data here; signed out, no one yet.
 */
export function localCaptureOwner() {
  const profile = profileOwner$.get()
  if (profile !== null) return profile
  return (needsAccountChoice() ? getSyncOwner() : auth$.userId.get()) ?? UNOWNED
}

// The extension and desktop app keep each account's data in a profile of its own, which stays
// that account's while signed out. They set its owner here; null leaves it to the account.
const profileOwner$ = observable<string | null>(null)
export function setProfileCaptureOwner(owner: string) {
  profileOwner$.set(owner)
}

/** For rendering: the extension's useValue takes an observable, not a selector. */
export const localCaptureOwner$ = observable(localCaptureOwner)

function captureContext() {
  const owner = localCaptureOwner()
  const generation = getSyncGeneration()
  return { owner, current: () => localCaptureOwner() === owner && getSyncGeneration() === generation }
}

/** Saves a post on this device. Only a paid account's sync uploads it; any other capture stays local. */
export function saveSocialPostHere(url: string) {
  const { owner, current } = captureContext()
  return saveSocialPost(url, owner, current)
}

/** Saves a post captured from its page here, for this device's account. */
export function storeSocialPostHere(url: string, post: SocialPost) {
  const { owner, current } = captureContext()
  return storeSocialPost(url, post, owner, current)
}

// One capture at a time: sharing many links at once must not fan out provider fetches.
let queue = Promise.resolve()

/** Saves a newly added SNS bookmark's post in the background, unless turned off in settings. */
export function autoSaveSocialPost(id: string) {
  const url = bookmarks$.bookmarks.peek().find((item) => item.id === id)?.url
  if (!url || !socialTarget(url) || !settings$.autoSaveSocialPosts.peek()) return
  // A share drained at startup arrives before the session is read, which would change the owner.
  if (!auth$.loaded.peek()) {
    void when(auth$.loaded).then(() => autoSaveSocialPost(id))
    return
  }
  // Taken now: the queue may drain after a sign-in or sign-out, and the bookmark was added for this owner.
  const { owner, current } = captureContext()
  queue = queue.then(async () => {
    const bookmark = bookmarks$.bookmarks.peek().find((item) => item.id === id)
    if (!current() || !bookmark || isDeleted(bookmark) || bookmark.url !== url || !settings$.autoSaveSocialPosts.peek()) return
    // A capture synced from another device and not downloaded yet: a new one would replace it.
    const key = getBookmarkUrlKey(url)
    if (bookmarks$.bookmarks.peek().some((item) => !isDeleted(item) && getBookmarkUrlKey(item.url) === key && postRef(item))) return
    // Any capture here already, whoever it belongs to, is kept: the manual action re-captures.
    if ((await readPreview(socialKey(url)))?.savedPost) return
    await saveSocialPost(url, owner, current)
  }).catch(() => {})
}
