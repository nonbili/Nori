import { browser } from 'wxt/browser'
import { activateAccount, finishPromotion, getAuthState, hostedSignIn, signOut, syncProfile } from '../lib/api'
import { createProfile } from '../lib/domain'
import { collectChangedRowIds } from 'nori/lib/supabase/sync-merge'
import { loadState, saveState } from '../lib/storage'
import type { AppSnapshot, AuthState, RequestMessage, ResponseMessage, StateChangedMessage } from '../lib/model'

let auth: AuthState = { loaded: false, plan: 'free', source: 'none' }
let syncing = false
let syncError: string | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined
let operation = Promise.resolve<unknown>(undefined)

function enqueue<T>(run: () => Promise<T>) {
  const next = operation.then(run, run)
  operation = next.catch(() => undefined)
  return next
}

async function snapshot(): Promise<AppSnapshot> {
  const state = await loadState()
  const profile = state.profiles[state.activeProfileId] || (state.profiles[state.activeProfileId] = createProfile())
  return { profile, profileId: state.activeProfileId, preferences: state.preferences, auth, syncing, syncError }
}

function notifyStateChanged() {
  const message: StateChangedMessage = { type: 'state-changed' }
  void browser.runtime.sendMessage(message).catch(() => undefined)
}

async function runSync(broadcast = true) {
  if (syncing) return
  syncing = true
  syncError = undefined
  try {
    const state = await loadState()
    const profile = state.profiles[state.activeProfileId] || (state.profiles[state.activeProfileId] = createProfile())
    if (await syncProfile(profile, auth)) finishPromotion(state, profile)
    await saveState(state)
  } catch (error) {
    syncError = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    syncing = false
    if (broadcast) notifyStateChanged()
  }
}

function queueSync() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void enqueue(() => runSync()).catch(() => undefined), 1000)
}

async function mutate(message: RequestMessage): Promise<void> {
  const state = await loadState()
  const profile = state.profiles[state.activeProfileId] || (state.profiles[state.activeProfileId] = createProfile())
  switch (message.type) {
    case 'replace-data': {
      const changedListIds = collectChangedRowIds(message.lists, profile.lists)
      const changedBookmarkIds = collectChangedRowIds(message.bookmarks, profile.bookmarks)
      profile.lists = message.lists
      profile.bookmarks = message.bookmarks
      if (message.history) profile.history = message.history
      if (message.preferences) state.preferences = { ...state.preferences, ...message.preferences }
      profile.pendingListIds = [...new Set([...profile.pendingListIds, ...changedListIds])]
      profile.pendingBookmarkIds = [...new Set([...profile.pendingBookmarkIds, ...changedBookmarkIds])]
      break
    }
    case 'set-preferences':
      state.preferences = { ...state.preferences, ...message.preferences }
      break
    default:
      throw new Error('Unsupported mutation')
  }
  await saveState(state)
  queueSync()
}

async function handleMessage(message: RequestMessage): Promise<ResponseMessage> {
  try {
    if (message.type === 'snapshot') return { ok: true, data: await snapshot() }
    if (message.type === 'sign-out') {
      await signOut()
      auth = { loaded: true, plan: 'free', source: 'none' }
      notifyStateChanged()
      return { ok: true, data: await snapshot() }
    }
    if (message.type === 'sync') {
      await runSync()
      return { ok: true, data: await snapshot() }
    }
    const data = await mutate(message)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function handleSignIn(): Promise<ResponseMessage> {
  try {
    // Keep interactive browser UI outside the state-operation queue so tabs can
    // continue reading snapshots while the user completes or abandons sign-in.
    const nextAuth = await hostedSignIn()
    return await enqueue(async () => {
      try {
        auth = nextAuth
        const state = await loadState()
        activateAccount(state, auth)
        await saveState(state)
        // Finish the initial pull before reporting sign-in complete so the
        // requesting page's refresh includes the synced profile.
        await runSync(false).catch(() => undefined)
        notifyStateChanged()
        return { ok: true, data: await snapshot() }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export default defineBackground(() => {
  void enqueue(async () => {
    const next = await getAuthState()
    auth = next
    if (auth.userId) {
      const state = await loadState()
      activateAccount(state, auth)
      await saveState(state)
      queueSync()
    }
    notifyStateChanged()
  })
  browser.alarms.create('nori-sync', { periodInMinutes: 15 })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'nori-sync') void enqueue(() => runSync()).catch(() => undefined)
  })
  browser.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
    const response = message.type === 'sign-in' ? handleSignIn() : enqueue(() => handleMessage(message))
    void response.then(sendResponse)
    return true
  })
})
