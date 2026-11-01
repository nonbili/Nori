import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { previewKey, type BookmarkPreview } from '../../lib/bookmark-preview-types'
import {
  createScreenshotStore,
  removeOrphanedScreenshots,
  SCREENSHOT_BUCKET,
  syncScreenshots,
  type ScreenshotBookmark,
  type ScreenshotRef,
  type ScreenshotSyncHost,
} from '../../lib/screenshot-sync'
import { Device } from './device-client'
import { localConfig } from './protocol'

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const NORI_SYNC_PRICE = 'price_1TKBfLHiU2avyi3sWKMbfUt9'
const NORA_SYNC_PRICE = 'price_1SrU6bHiU2avyi3sNvj80Azi'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9])

interface User { id: string; email: string; password: string; client: SupabaseClient }

describe('sync against local Supabase', () => {
  let admin: SupabaseClient
  const users: User[] = []
  const devices: Device[] = []

  async function device(userIndex = 0) {
    const instance = await Device.start(users[userIndex].email, users[userIndex].password)
    devices.push(instance)
    return instance
  }

  async function setPlan(userId: string, status: 'active' | 'expired') {
    const { error } = await admin.schema('nori').from('app_store_subscriptions').insert({
      original_transaction_id: crypto.randomUUID(), user_id: userId, product_id: 'nori_sync', status,
      expires_at: null, latest_transaction_jws: 'test',
    })
    if (error) throw error
  }

  async function createUser(plan: boolean) {
    const { url, anonKey } = localConfig()
    const email = `nori-sync-${crypto.randomUUID()}@example.com`
    const password = crypto.randomUUID()
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    const user = { id: data.user.id, email, password, client: createClient(url, anonKey, options) }
    users.push(user)
    const login = await user.client.auth.signInWithPassword({ email, password })
    if (login.error) throw login.error
    if (plan) await setPlan(user.id, 'active')
    return user
  }

  const remoteBookmarks = async (userId: string) => {
    const { data, error } = await admin.schema('nori').from('bookmarks').select('id,title,json,updated_at').eq('user_id', userId).limit(5000)
    if (error) throw error
    return data
  }
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id)

  beforeEach(async () => {
    const { url, serviceKey } = localConfig()
    admin = createClient(url, serviceKey, options)
    await createUser(true)
    await createUser(true)
    const { error } = await users[0].client.schema('nori').from('bookmarks').select('id').limit(1)
    if (error) throw new Error(`Local nori.bookmarks unavailable: ${error.message}`)
  })

  afterEach(async () => {
    await Promise.all(devices.splice(0).map((instance) => instance.close()))
    const errors: string[] = []
    for (const user of users.splice(0)) {
      const { data } = await admin.storage.from(SCREENSHOT_BUCKET).list(user.id)
      if (data?.length) await admin.storage.from(SCREENSHOT_BUCKET).remove(data.map((file) => `${user.id}/${file.name}`))
      const { error } = await admin.auth.admin.deleteUser(user.id)
      if (error) errors.push(error.message)
    }
    if (errors.length) throw new Error(`Test user cleanup failed: ${errors.join(', ')}`)
  })

  it('merges two devices on first sync and propagates later edits and deletes', async () => {
    const [one, two] = [await device(), await device()]
    await one.add('from-one')
    await one.sync()
    await two.add('from-two')
    await two.sync()
    await one.sync()
    for (const instance of [one, two]) expect(ids((await instance.snapshot()).bookmarks)).toEqual(expect.arrayContaining(['from-one', 'from-two']))

    await one.command({ op: 'edit', id: 'from-two', title: 'Renamed' })
    await two.command({ op: 'delete', id: 'from-one' })
    await one.sync()
    await two.sync()
    await one.sync()
    const seen = (await one.snapshot()).bookmarks
    expect(seen.find((row) => row.id === 'from-two')!.title).toBe('Renamed')
    expect(seen.find((row) => row.id === 'from-one')!.json.deleted_at).toBeTruthy()
  })

  it('paginates beyond the API row limit with tied timestamps, then pulls incrementally', async () => {
    const one = await device()
    await one.sync()
    // One statement, so one transaction: every row gets the same `updated_at`.
    const rows = Array.from({ length: 1100 }, (_, index) => ({
      user_id: users[0].id, id: `bulk-${index}`, list_id: 'builtin-later', url: `https://bulk.example/${index}`, title: 'Bulk', json: {},
    }))
    const { error } = await admin.schema('nori').from('bookmarks').insert(rows)
    expect(error).toBeNull()
    await one.sync()
    expect((await one.snapshot()).bookmarks.filter((row) => row.id.startsWith('bulk-'))).toHaveLength(1100)

    const two = await device()
    await two.sync()
    await one.add('later')
    await one.sync()
    await two.sync()
    expect(ids((await two.snapshot()).bookmarks)).toContain('later')
  })

  it('keeps every account to its own rows through the API', async () => {
    const one = await device()
    await one.add('private')
    await one.sync()
    const other = users[1].client.schema('nori')
    expect((await other.from('bookmarks').select('id').eq('user_id', users[0].id)).data).toEqual([])
    expect((await other.from('bookmarks').insert({ user_id: users[0].id, id: 'planted', list_id: 'builtin-later', url: 'https://x.example/', title: 'x' })).error).not.toBeNull()
    await other.from('bookmarks').update({ title: 'taken' }).eq('id', 'private')
    await other.from('bookmarks').delete().eq('id', 'private')
    expect((await remoteBookmarks(users[0].id)).find((row) => row.id === 'private')!.title).toBe('private')
  })

  it('advances updated_at only when a row changes', async () => {
    const one = await device()
    await one.add('steady')
    await one.sync()
    const api = users[0].client.schema('nori')
    const before = (await remoteBookmarks(users[0].id)).find((row) => row.id === 'steady')!
    await Bun.sleep(5)
    const row = { user_id: users[0].id, id: 'steady', list_id: 'builtin-later', url: 'https://steady.example/', title: 'steady', json: before.json }
    await api.from('bookmarks').upsert(row, { onConflict: 'user_id,id' })
    expect((await remoteBookmarks(users[0].id)).find((item) => item.id === 'steady')!.updated_at).toBe(before.updated_at)
    await api.from('bookmarks').upsert({ ...row, title: 'moved' }, { onConflict: 'user_id,id' })
    expect((await remoteBookmarks(users[0].id)).find((item) => item.id === 'steady')!.updated_at).not.toBe(before.updated_at)
  })

  it('retains changes after a failed push and retries them', async () => {
    const one = await device()
    await one.add('stubborn')
    await one.command({ op: 'failNextPush', table: 'bookmarks' })
    await expect(one.sync()).rejects.toThrow('Injected push failure')
    expect((await one.snapshot()).meta.pendingBookmarkIds).toContain('stubborn')
    await one.sync()
    expect((await one.snapshot()).meta.pendingBookmarkIds).toEqual([])
    expect(ids(await remoteBookmarks(users[0].id))).toContain('stubborn')
  })

  it('writes an edit made while a push was in flight', async () => {
    const one = await device()
    await one.add('moving')
    await one.sync()
    await one.command({ op: 'edit', id: 'moving', title: 'First' })
    const held = one.command({ op: 'holdNextRequest', path: 'bookmarks' })
    const syncing = one.sync()
    await held
    await one.command({ op: 'edit', id: 'moving', title: 'Second' })
    await one.command({ op: 'releaseFetch' })
    await syncing
    await one.sync()
    expect((await remoteBookmarks(users[0].id)).find((row) => row.id === 'moving')!.title).toBe('Second')
  })

  it('pauses sync on another account until the user chooses, uploading nothing meanwhile', async () => {
    const one = await device()
    await one.add('of-a')
    await one.sync()
    await one.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    await one.sync()
    await one.add('edited-while-paused')
    await Bun.sleep(1500)
    expect((await one.snapshot()).needsAccountChoice).toBe(true)
    expect(await remoteBookmarks(users[1].id)).toEqual([])
  })

  it('replaces the device with the account, keeping a backup and pushing nothing of the old account', async () => {
    const [a, b] = [await device(0), await device(1)]
    await a.add('of-a')
    await a.sync()
    await b.add('of-b')
    await b.sync()
    await a.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    await a.command({ op: 'accountChoice', choice: 'useAccount' })
    const seen = await a.snapshot()
    expect(ids(seen.bookmarks)).toContain('of-b')
    expect(ids(seen.bookmarks)).not.toContain('of-a')
    expect(ids(await remoteBookmarks(users[1].id))).not.toContain('of-a')
    expect(seen.owner.ownerUserId).toBe(users[1].id)
    expect(seen.owner.switchBackup!.fromUserId).toBe(users[0].id)
    expect(seen.owner.switchBackup!.json).toContain('https://of-a.example/')
  })

  it('starts from the starter data when the account to use has nothing yet', async () => {
    const a = await device(0)
    await a.add('of-a')
    await a.sync()
    await a.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    await a.command({ op: 'accountChoice', choice: 'useAccount' })
    expect(ids((await a.snapshot()).bookmarks)).not.toContain('of-a')
    expect(ids(await remoteBookmarks(users[1].id))).not.toContain('of-a')
  })

  it('merges the device into the account: the account keeps its rows and gains what only the device had', async () => {
    const [a, b] = [await device(0), await device(1)]
    await a.add('only-device')
    await a.add('same-page', 'https://both.example/')
    await a.sync()
    await b.add('kept', 'https://both.example/')
    await b.sync()
    await a.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    await a.command({ op: 'accountChoice', choice: 'mergeDevice' })
    const rows = ids(await remoteBookmarks(users[1].id))
    expect(rows).toEqual(expect.arrayContaining(['only-device', 'kept']))
    expect(rows).not.toContain('same-page')
    expect((await a.snapshot()).meta.pendingBookmarkIds).toEqual([])
    await b.sync()
    expect(ids((await b.snapshot()).bookmarks)).toContain('only-device')
  })

  it('drops a run whose account changed while its request was in flight', async () => {
    const one = await device()
    await one.add('of-a')
    const held = one.command({ op: 'holdNextRequest', path: 'bookmarks' })
    const syncing = one.sync()
    await held
    await one.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    await one.command({ op: 'releaseFetch' })
    await syncing
    expect(await remoteBookmarks(users[1].id)).toEqual([])
    expect(ids(await remoteBookmarks(users[0].id))).not.toContain('of-a')
  })

  it('keeps the owner of a device whose first sync failed, so another account does not inherit its data', async () => {
    const one = await device()
    await one.add('of-a')
    await one.command({ op: 'failNextPush', table: 'lists' })
    await expect(one.sync()).rejects.toThrow('Injected push failure')
    await one.command({ op: 'signIn', email: users[1].email, password: users[1].password })
    const seen = await one.snapshot()
    expect(seen.owner.ownerUserId).toBe(users[0].id)
    expect(seen.needsAccountChoice).toBe(true)
  })

  it('refuses sync writes without a plan, leaving data readable and removable', async () => {
    const free = await createUser(false)
    const row = (id: string, user = free) => ({ user_id: user.id, id, list_id: 'starter', url: `https://${id}.example/`, title: id })
    const list = { user_id: free.id, id: 'starter', name: 'Starter' }
    const api = free.client.schema('nori')
    expect((await api.from('lists').insert(list)).error).not.toBeNull()

    // A Nora plan is not a Nori plan.
    await admin.from('customers').insert({ user_id: free.id, customer: 'cus_test', subscription: 'sub_test', plan: NORA_SYNC_PRICE })
    expect((await api.from('lists').insert(list)).error).not.toBeNull()

    await admin.from('customers').update({ plan: NORI_SYNC_PRICE }).eq('user_id', free.id)
    expect((await api.from('lists').insert(list)).error).toBeNull()
    expect((await api.from('bookmarks').insert(row('kept'))).error).toBeNull()

    await admin.from('customers').delete().eq('user_id', free.id)
    await setPlan(free.id, 'active')
    await Bun.sleep(5)
    await setPlan(free.id, 'expired')
    expect((await api.from('bookmarks').insert(row('refused'))).error).not.toBeNull()
    await api.from('bookmarks').update({ title: 'refused' }).eq('id', 'kept')
    expect((await api.from('bookmarks').select('title')).data).toEqual([{ title: 'kept' }])
    expect((await api.from('bookmarks').delete().eq('id', 'kept').select('id')).data).toEqual([{ id: 'kept' }])

    expect((await api.from('app_store_subscriptions').insert({
      original_transaction_id: 'forged', user_id: free.id, product_id: 'nori_sync', status: 'active', latest_transaction_jws: 'forged',
    })).error).not.toBeNull()
    expect((await api.from('billing_accounts').select('user_id')).error).not.toBeNull()
  })

  describe('screenshots', () => {
    const fetchDataUrl = async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`download failed: ${response.status}`)
      return `data:image/jpeg;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    }
    const bucket = (user: User) => user.client.storage.from(SCREENSHOT_BUCKET)
    const store = (user: User) => createScreenshotStore(bucket(user) as never, fetchDataUrl)

    it('carries a capture to another device through the real bucket', async () => {
      const url = 'https://captured.example/'
      const key = previewKey(url, 'screenshot')
      const capture: BookmarkPreview = { description: '', imageUrl: '', imageUri: 'data:image/jpeg;base64,x', savedAt: 100 }
      const host = (saved: Map<string, BookmarkPreview>, refs: ScreenshotRef[]): ScreenshotSyncHost => ({
        store: store(users[0]),
        read: async (id) => saved.get(id),
        write: async (id, value) => void saved.set(id, value),
        shrink: async () => JPEG,
        setRef: (_ids, ref) => void refs.push(ref),
        changed: () => {},
        newId: () => crypto.randomUUID(),
      })
      const bookmark = (ref?: ScreenshotRef): ScreenshotBookmark => ({ id: 'a', url, json: { previewSource: 'screenshot', screenshot: ref } })

      const refs: ScreenshotRef[] = []
      await syncScreenshots(users[0].id, [bookmark()], 'page-image', host(new Map([[key, capture]]), refs))
      expect(refs).toHaveLength(1)

      const second = new Map<string, BookmarkPreview>()
      await syncScreenshots(users[0].id, [bookmark(refs[0])], 'page-image', host(second, []))
      expect(second.get(key)).toMatchObject({ savedAt: 100 })
      expect(Buffer.from(second.get(key)!.imageUri.split(',')[1], 'base64')).toEqual(Buffer.from(JPEG))
    })

    it('keeps objects to their owner and to accounts with a plan', async () => {
      const path = `${users[0].id}/a.jpg`
      const jpeg = { contentType: 'image/jpeg' }
      expect((await bucket(users[0]).upload(path, JPEG, jpeg)).error).toBeNull()
      expect((await bucket(users[1]).upload(`${users[0].id}/b.jpg`, JPEG, jpeg)).error).not.toBeNull()
      // Account deletion lists one folder, so nothing may sit deeper.
      expect((await bucket(users[0]).upload(`${users[0].id}/nested/b.jpg`, JPEG, jpeg)).error).not.toBeNull()
      expect((await bucket(users[1]).createSignedUrl(path, 60)).error).not.toBeNull()
      expect((await bucket(users[1]).list(users[0].id)).data).toEqual([])
      await bucket(users[1]).remove([path])
      expect((await bucket(users[0]).list(users[0].id)).data).toHaveLength(1)
      expect((await fetch(bucket(users[0]).getPublicUrl(path).data.publicUrl)).ok).toBe(false)

      await setPlan(users[0].id, 'expired')
      expect((await bucket(users[0]).upload(`${users[0].id}/c.jpg`, JPEG, jpeg)).error).not.toBeNull()
      expect((await bucket(users[0]).createSignedUrl(path, 60)).error).toBeNull()
      expect((await bucket(users[0]).remove([path])).data).toHaveLength(1)
    })

    it('refuses what the bucket does not take', async () => {
      const refused = async (body: Uint8Array, contentType: string) =>
        (await bucket(users[0]).upload(`${users[0].id}/${crypto.randomUUID()}.jpg`, body, { contentType })).error
      expect(await refused(JPEG, 'image/png')).not.toBeNull()
      expect(await refused(new Uint8Array(600 * 1024), 'image/jpeg')).not.toBeNull()
    })

    it('removes only old objects nothing points at', async () => {
      const paths = [`${users[0].id}/used.jpg`, `${users[0].id}/orphan.jpg`]
      for (const path of paths) await bucket(users[0]).upload(path, JPEG, { contentType: 'image/jpeg' })
      const bookmark = { id: 'a', url: 'https://x.example/', json: { screenshot: { path: paths[0], savedAt: 1, url: 'https://x.example/' } } }
      await removeOrphanedScreenshots(users[0].id, [bookmark], store(users[0]))
      expect((await bucket(users[0]).list(users[0].id)).data).toHaveLength(2)
      await removeOrphanedScreenshots(users[0].id, [bookmark], store(users[0]), Date.now() + 8 * 24 * 60 * 60 * 1000)
      expect((await bucket(users[0]).list(users[0].id)).data!.map((file) => file.name)).toEqual(['used.jpg'])
    })
  })
})
