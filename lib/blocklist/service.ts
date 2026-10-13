import { syncState, when } from '@legendapp/state'
import NoriView from '@/modules/nori-view'
import { blocklist$ } from '@/states/blocklist'
import { BLOCKLIST_PARSER_VERSION, mergeFilterListsAsync } from './parser'
import { shouldAutoRefresh } from './policy'
import {
  hasBlocklistSourceFiles,
  readBlocklistMatcherSnapshot,
  readBlocklistSourceFile,
  writeBlocklistMatcherSnapshot,
  writeBlocklistSourceFile,
} from './storage'
import {
  BLOCKLIST_SOURCE_IDS,
  BlocklistFetchSourceResult,
  BlocklistPayload,
  BlocklistSnapshot,
  BlocklistSourceId,
  PersistedBlocklistMatcherSnapshot,
  RemoteTextResponse,
} from './types'

const BLOCKLIST_FETCH_TIMEOUT_MS = 20_000
const BLOCKLIST_REFRESH_TIMEOUT_MS = 60_000

export const supportsRuntimeBlocklist = () => NoriView != null

export async function waitForBlocklistPersist() {
  await when(syncState(blocklist$).isPersistLoaded)
}

async function fetchRemoteText(url: string, headers: Record<string, string>): Promise<RemoteTextResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BLOCKLIST_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok && res.status !== 304) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
    }
    return {
      status: res.status,
      body: await res.text(),
      headers: {
        etag: res.headers.get('etag') || undefined,
        'last-modified': res.headers.get('last-modified') || undefined,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out fetching blocklist after ${BLOCKLIST_FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSource(id: BlocklistSourceId, now: number): Promise<BlocklistFetchSourceResult> {
  const source = blocklist$.sources[id].get()
  const headers: Record<string, string> = {}
  if (source.etag) headers['If-None-Match'] = source.etag
  if (source.lastModified) headers['If-Modified-Since'] = source.lastModified

  const response = await fetchRemoteText(source.url, headers)
  if (response.status === 304) {
    if (!(await readBlocklistSourceFile(id))) {
      throw new Error(`Received 304 without cached blocklist data for ${id}`)
    }
    return { id, status: 304, etag: source.etag, lastModified: source.lastModified, lastFetchedAt: now }
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to fetch ${id}: HTTP ${response.status}`)
  }
  return {
    id,
    status: response.status,
    body: response.body,
    etag: response.headers.etag,
    lastModified: response.headers['last-modified'],
    lastFetchedAt: now,
  }
}

async function mergeSnapshot(bodies: string[], revision: number): Promise<PersistedBlocklistMatcherSnapshot> {
  const merged = await mergeFilterListsAsync(bodies)
  return {
    revision,
    parserVersion: BLOCKLIST_PARSER_VERSION,
    blockedHosts: merged.blockedHosts.join('\n'),
    allowedHosts: merged.allowedHosts.join('\n'),
  }
}

/** The matcher saved for this revision, rebuilt from the cached lists when it is missing or stale. */
async function readMatcher(revision: number): Promise<PersistedBlocklistMatcherSnapshot | null> {
  const stored = await readBlocklistMatcherSnapshot()
  if (stored?.revision === revision && stored.parserVersion === BLOCKLIST_PARSER_VERSION) {
    return stored
  }

  const bodies = await Promise.all(BLOCKLIST_SOURCE_IDS.map((id) => readBlocklistSourceFile(id)))
  if (bodies.some((body) => !body)) {
    return null
  }
  const rebuilt = await mergeSnapshot(bodies as string[], revision)
  if (!rebuilt.blockedHosts && !rebuilt.allowedHosts) {
    return null
  }
  await writeBlocklistMatcherSnapshot(rebuilt)
  return rebuilt
}

let payloadCache: { revision: number; payload: BlocklistPayload } | undefined
let lastApplied: { revision: number; enabled: boolean } | undefined

let pendingApply: Promise<void> = Promise.resolve()

/**
 * Hands the current list to the native views, or switches blocking off when it is disabled or not
 * downloaded yet. Calls queue up, so awaiting one means every earlier change has landed too.
 */
export function applyBlocklist() {
  pendingApply = pendingApply.catch(() => {}).then(applyBlocklistNow)
  return pendingApply
}

async function applyBlocklistNow() {
  if (!supportsRuntimeBlocklist()) {
    return
  }

  const state = blocklist$.get()
  const enabled = state.enabled && state.hasSnapshot
  if (lastApplied?.revision === state.revision && lastApplied.enabled === enabled) {
    return
  }

  let payload: BlocklistPayload = { enabled: false, blockedHosts: '', allowedHosts: '', revision: state.revision }
  if (enabled) {
    if (payloadCache?.revision === state.revision) {
      payload = payloadCache.payload
    } else {
      const matcher = await readMatcher(state.revision)
      if (matcher) {
        payload = { enabled: true, blockedHosts: matcher.blockedHosts, allowedHosts: matcher.allowedHosts, revision: matcher.revision }
        payloadCache = { revision: state.revision, payload }
      }
    }
  }

  lastApplied = { revision: state.revision, enabled }
  await NoriView?.setBlocklist(payload)
}

let inFlightRefresh: Promise<boolean> | undefined

export async function refreshBlocklist({ manual = false } = {}) {
  // The checks in runRefresh await storage before `phase` becomes 'fetching', so without this
  // two callers (startup, interval, foreground) could both pass them and fetch in parallel.
  while (inFlightRefresh) {
    const pending = inFlightRefresh
    if (!manual) return pending
    await pending.catch(() => false)
  }

  const refresh = runRefresh(manual).finally(() => {
    if (inFlightRefresh === refresh) inFlightRefresh = undefined
  })
  inFlightRefresh = refresh
  return refresh
}

async function runRefresh(manual: boolean) {
  await waitForBlocklistPersist()

  const current = blocklist$.get()
  if (!manual && !current.enabled) {
    return false
  }
  const storedFilesReady = await hasBlocklistSourceFiles(BLOCKLIST_SOURCE_IDS)
  if (!manual && !shouldAutoRefresh(current) && current.hasSnapshot && storedFilesReady) {
    return false
  }
  if (current.phase === 'fetching') {
    return false
  }

  const previous = current.hasSnapshot ? await readBlocklistMatcherSnapshot() : null
  blocklist$.assign({ phase: 'fetching', lastError: undefined })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const work = (async () => {
    const now = Date.now()
    const settled = await Promise.allSettled(BLOCKLIST_SOURCE_IDS.map((id) => fetchSource(id, now)))
    const failure = settled.find((result) => result.status === 'rejected')
    if (failure) {
      throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))
    }
    const results = settled.map((result) => (result as PromiseFulfilledResult<BlocklistFetchSourceResult>).value)

    const bodies = await Promise.all(
      results.map(async (result) => result.body ?? (await readBlocklistSourceFile(result.id))),
    )
    if (bodies.some((body) => !body)) {
      throw new Error('Blocklist source files are missing or invalid')
    }

    const revision = current.revision + 1
    const next = await mergeSnapshot(bodies as string[], revision)
    if (!next.blockedHosts && !next.allowedHosts) {
      throw new Error('Blocklist source files are missing or invalid')
    }

    await Promise.all([
      ...results
        .filter((result) => typeof result.body === 'string')
        .map((result) => writeBlocklistSourceFile(result.id, result.body || '')),
      writeBlocklistMatcherSnapshot(next),
    ])

    const changed = next.blockedHosts !== (previous?.blockedHosts || '') || next.allowedHosts !== (previous?.allowedHosts || '')
    const sources = { ...current.sources } as BlocklistSnapshot['sources']
    for (const result of results) {
      sources[result.id] = {
        ...current.sources[result.id],
        etag: result.etag,
        lastModified: result.lastModified,
        lastFetchedAt: result.lastFetchedAt,
      }
    }
    blocklist$.assign({
      phase: 'ready',
      hasSnapshot: true,
      lastUpdatedAt: now,
      lastError: undefined,
      revision: changed ? revision : current.revision,
      sources,
    })
    payloadCache = undefined
    return true
  })()

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Update timed out after ${BLOCKLIST_REFRESH_TIMEOUT_MS / 1000} seconds`)),
          BLOCKLIST_REFRESH_TIMEOUT_MS,
        )
      }),
    ])
  } catch (error) {
    blocklist$.assign({ phase: 'error', lastError: error instanceof Error ? error.message : String(error) })
    // Losing the race does not cancel the work; settle it before releasing the refresh lock.
    await work.catch(() => false)
    return false
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export const refreshBlocklistIfDue = () => refreshBlocklist({ manual: false })
