// Each device has its own process and stores. Only persistence and the client wiring are
// replaced; the sync code is the app's and its queries hit Supabase.
import { mock } from 'bun:test'
import { observable } from '@legendapp/state'
import { createClient } from '@supabase/supabase-js'
import { createStarterBookmarks, createStarterLists, type BookmarkRecordData } from '@/lib/nori-data'
import { describeSyncError } from '@/lib/supabase/sync-error'
import { localConfig, type Command } from './protocol'

const { url, anonKey } = localConfig()
let failTable: string | undefined
// A request to this path waits until released, to change things while it is in flight.
let holdPath: string | undefined
let releaseHeld: (() => void) | undefined
let heldStarted: (() => void) | undefined
const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname
      if (holdPath && path === `/rest/v1/${holdPath}`) {
        holdPath = undefined
        heldStarted?.()
        return new Promise<void>((resolve) => { releaseHeld = resolve }).then(() => fetch(input, init))
      }
      if (failTable && init?.method === 'POST' && path === `/rest/v1/${failTable}`) {
        failTable = undefined
        return Promise.resolve(new Response(JSON.stringify({ message: 'Injected push failure', code: 'TEST_FAILURE' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        }))
      }
      return fetch(input, init)
    }, { preconnect: fetch.preconnect }),
  },
})

const auth$ = observable({ userId: undefined as string | undefined, plan: 'sync' })
const lists$ = observable({ lists: createStarterLists() })
const bookmarks$ = observable({ bookmarks: createStarterBookmarks() })
const syncMeta$ = observable({
  inFlight: false, lastSyncAt: undefined as number | undefined, lastError: undefined as string | undefined,
  pendingListIds: [] as string[], pendingBookmarkIds: [] as string[], syncUserId: undefined as string | undefined,
  syncListsCursor: undefined as string | undefined, syncBookmarksCursor: undefined as string | undefined,
  lastFullPullAt: undefined as number | undefined,
})
const syncOwner$ = observable({
  ownerUserId: undefined as string | undefined,
  switchBackup: undefined as { fromUserId?: string; savedAt: number; json: string } | undefined,
})
mock.module('@/states/auth', () => ({ auth$ }))
mock.module('@/states/lists', () => ({ lists$ }))
mock.module('@/states/bookmarks', () => ({ bookmarks$ }))
mock.module('@/states/sync-meta', () => ({ syncMeta$ }))
mock.module('@/states/sync-owner', () => ({ syncOwner$ }))
mock.module('@/lib/supabase/client', () => ({ supabase: client.schema('nori') }))
mock.module('@/lib/bookmark-preview', () => ({ forgetScreenshots: async () => {}, setScreenshotCaptured: () => {}, setScreenshotOwner: () => {} }))
mock.module('@/lib/supabase/screenshots', () => ({ runScreenshotSync: async () => {}, removeOrphans: async () => {} }))

const { startSupabaseSyncWatchers, syncSupabase } = await import('@/lib/supabase/sync')
const { resolveAccountChoice } = await import('@/lib/supabase/sync-account')
const { needsAccountChoice } = await import('@/lib/supabase/sync-session')
startSupabaseSyncWatchers()

async function signIn(email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  auth$.userId.set(data.user.id)
}

function patch(id: string, change: (row: BookmarkRecordData) => BookmarkRecordData) {
  bookmarks$.bookmarks.set(bookmarks$.bookmarks.peek().map((row) => row.id === id ? { ...change(row), updatedAt: new Date().toISOString() } : row))
}

await signIn(process.env.NORI_SYNC_EMAIL!, process.env.NORI_SYNC_PASSWORD!)

async function execute(command: Command) {
  switch (command.op) {
    case 'snapshot': return JSON.parse(JSON.stringify({
      lists: lists$.lists.peek(), bookmarks: bookmarks$.bookmarks.peek(), meta: syncMeta$.peek(), owner: syncOwner$.peek(),
      userId: auth$.userId.peek(), needsAccountChoice: needsAccountChoice(),
    }))
    case 'add': {
      const now = new Date().toISOString()
      bookmarks$.bookmarks.set([...bookmarks$.bookmarks.peek(), {
        id: command.id, listId: 'builtin-later', url: command.url, title: command.title ?? command.id, icon: '',
        json: { visible: true, sort_index: 0, deleted_at: null }, createdAt: now, updatedAt: now,
      }])
      break
    }
    case 'edit': patch(command.id, (row) => ({ ...row, title: command.title })); break
    case 'delete': patch(command.id, (row) => ({ ...row, json: { ...row.json, deleted_at: new Date().toISOString() } })); break
    case 'sync': await syncSupabase(); break
    case 'signIn': await signIn(command.email, command.password); break
    case 'accountChoice': await resolveAccountChoice(command.choice); break
    case 'failNextPush': failTable = command.table; break
    case 'holdNextRequest':
      holdPath = command.path
      // Answers once a matching request is in flight, not when it is released.
      return new Promise<null>((resolve) => { heldStarted = () => resolve(null) })
    case 'releaseFetch': releaseHeld?.(); releaseHeld = undefined; break
  }
  return null
}

process.on('message', async (message: { id: number; command: Command }) => {
  try {
    process.send?.({ id: message.id, value: await execute(message.command) })
  } catch (error) {
    process.send?.({ id: message.id, error: describeSyncError(error) })
  }
})
process.send?.({ ready: true })
