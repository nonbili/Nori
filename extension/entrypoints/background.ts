import { browser } from 'wxt/browser'
import { activateAccount, finishPromotion, getAuthState, hostedSignIn, signOut, syncProfile } from '../lib/api'
import { cleanTags, createProfile, mark, now, reorder, saveBookmark, tombstone } from '../lib/domain'
import { getSortIndex, patchRowState } from 'nori/lib/nori-data'
import { loadState, saveState } from '../lib/storage'
import type { AppSnapshot, AuthState, RequestMessage, ResponseMessage } from '../lib/model'

let auth: AuthState = { loaded: false, plan: 'free', source: 'none' }
let syncing = false
let syncError: string | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined

async function snapshot(): Promise<AppSnapshot> {
  const state = await loadState()
  const profile = state.profiles[state.activeProfileId] || (state.profiles[state.activeProfileId] = createProfile())
  return { profile, profileId: state.activeProfileId, preferences: state.preferences, auth, syncing, syncError }
}

async function runSync() {
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
  }
}

function queueSync() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void runSync().catch(() => undefined), 1000)
}

async function mutate(message: RequestMessage): Promise<unknown> {
  const state = await loadState()
  const profile = state.profiles[state.activeProfileId] || (state.profiles[state.activeProfileId] = createProfile())
  let output: unknown
  switch (message.type) {
    case 'save-bookmark':
      output = saveBookmark(profile, message.draft)
      break
    case 'update-bookmark': {
      const item = profile.bookmarks.find((row) => row.id === message.id)
      if (!item) throw new Error('Bookmark not found')
      const timestamp = now()
      Object.assign(
        item,
        message.draft.title != null ? { title: message.draft.title.trim() || item.title } : {},
        message.draft.url ? { url: message.draft.url } : {},
        message.draft.listId ? { listId: message.draft.listId } : {},
        message.draft.icon != null ? { icon: message.draft.icon } : {},
      )
      if (message.draft.tags) item.json = { ...item.json, tags: cleanTags(message.draft.tags) }
      item.updatedAt = timestamp
      mark(profile.pendingBookmarkIds, item.id)
      break
    }
    case 'delete-bookmark':
      tombstone(profile.bookmarks, profile.pendingBookmarkIds, message.id)
      break
    case 'delete-bookmarks':
      message.ids.forEach((id) => tombstone(profile.bookmarks, profile.pendingBookmarkIds, id))
      break
    case 'restore-bookmarks': {
      const timestamp = now()
      message.ids.forEach((id) => {
        const item = profile.bookmarks.find((row) => row.id === id)
        if (!item) return
        item.json = patchRowState(item, { visible: true, deleted_at: null }).json
        item.updatedAt = timestamp
        mark(profile.pendingBookmarkIds, id)
      })
      break
    }
    case 'set-bookmark-visibility': {
      const timestamp = now()
      message.ids.forEach((id) => {
        const item = profile.bookmarks.find((row) => row.id === id)
        if (!item) return
        item.json = patchRowState(item, { visible: message.visible }).json
        item.updatedAt = timestamp
        mark(profile.pendingBookmarkIds, id)
      })
      break
    }
    case 'move-bookmarks': {
      if (!profile.lists.some((row) => row.id === message.listId)) throw new Error('List not found')
      const timestamp = now()
      const moving = new Set(message.ids)
      let sortIndex =
        profile.bookmarks
          .filter((row) => row.listId === message.listId && !moving.has(row.id))
          .reduce((maximum, row) => Math.max(maximum, getSortIndex(row)), -1) + 1
      message.ids.forEach((id) => {
        const item = profile.bookmarks.find((row) => row.id === id)
        if (!item) return
        item.listId = message.listId
        item.json = patchRowState(item, { sort_index: sortIndex++ }).json
        item.updatedAt = timestamp
        mark(profile.pendingBookmarkIds, id)
      })
      break
    }
    case 'open-bookmark': {
      const item = profile.bookmarks.find((row) => row.id === message.id)
      if (item)
        profile.history = [
          { id: item.id, url: item.url, title: item.title, icon: item.icon, openedAt: now() },
          ...profile.history.filter((row) => row.id !== item.id),
        ].slice(0, 10)
      break
    }
    case 'clear-history':
      profile.history = []
      break
    case 'restore-history':
      profile.history = message.items
      break
    case 'add-list': {
      const name = message.name.trim()
      if (!name) throw new Error('List name is required')
      const timestamp = now()
      const id = crypto.randomUUID()
      profile.lists.push({
        id,
        name,
        json: { visible: true, deleted_at: null, sort_index: profile.lists.length },
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      mark(profile.pendingListIds, id)
      output = id
      break
    }
    case 'rename-list': {
      const item = profile.lists.find((row) => row.id === message.id)
      if (!item) throw new Error('List not found')
      item.name = message.name.trim() || item.name
      item.updatedAt = now()
      mark(profile.pendingListIds, item.id)
      break
    }
    case 'delete-list': {
      tombstone(profile.lists, profile.pendingListIds, message.id)
      profile.bookmarks
        .filter((row) => row.listId === message.id)
        .forEach((row) => tombstone(profile.bookmarks, profile.pendingBookmarkIds, row.id))
      break
    }
    case 'restore-list': {
      const timestamp = now()
      const list = profile.lists.find((row) => row.id === message.list.id)
      if (list) {
        list.json = patchRowState(list, { visible: true, deleted_at: null }).json
        list.updatedAt = timestamp
      } else {
        profile.lists.push(message.list)
      }
      mark(profile.pendingListIds, message.list.id)
      message.bookmarks.forEach((snapshotRow) => {
        const item = profile.bookmarks.find((row) => row.id === snapshotRow.id)
        if (!item) return
        item.json = patchRowState(item, { visible: true, deleted_at: null }).json
        item.updatedAt = timestamp
        mark(profile.pendingBookmarkIds, item.id)
      })
      break
    }
    case 'set-list-visibility': {
      const item = profile.lists.find((row) => row.id === message.id)
      if (!item) throw new Error('List not found')
      item.json = patchRowState(item, { visible: message.visible }).json
      item.updatedAt = now()
      mark(profile.pendingListIds, item.id)
      break
    }
    case 'reorder-lists':
      reorder(profile.lists, message.ids, profile.pendingListIds)
      break
    case 'reorder-bookmarks':
      reorder(
        profile.bookmarks.filter((row) => row.listId === message.listId),
        message.ids,
        profile.pendingBookmarkIds,
      )
      break
    case 'replace-data': {
      profile.lists = message.lists
      profile.bookmarks = message.bookmarks
      profile.pendingListIds = message.lists.map((row) => row.id)
      profile.pendingBookmarkIds = message.bookmarks.map((row) => row.id)
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
  return output
}

export default defineBackground(() => {
  void getAuthState().then(async (next) => {
    auth = next
    if (auth.userId) {
      const state = await loadState()
      activateAccount(state, auth)
      await saveState(state)
      queueSync()
    }
  })
  browser.alarms.create('nori-sync', { periodInMinutes: 15 })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'nori-sync') void runSync().catch(() => undefined)
  })
  browser.runtime.onMessage.addListener(async (message: RequestMessage): Promise<ResponseMessage> => {
    try {
      if (message.type === 'snapshot') return { ok: true, data: await snapshot() }
      if (message.type === 'sign-in') {
        auth = await hostedSignIn()
        const state = await loadState()
        activateAccount(state, auth)
        await saveState(state)
        queueSync()
        return { ok: true, data: await snapshot() }
      }
      if (message.type === 'sign-out') {
        await signOut()
        auth = { loaded: true, plan: 'free', source: 'none' }
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
  })
})
