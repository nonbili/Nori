import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Command =
  | { op: 'snapshot' }
  | { op: 'add'; id: string; url: string; title?: string }
  | { op: 'edit'; id: string; title: string }
  | { op: 'delete'; id: string }
  | { op: 'sync' }
  | { op: 'signIn'; email: string; password: string }
  | { op: 'accountChoice'; choice: 'useAccount' | 'mergeDevice' }
  | { op: 'failNextPush'; table: string }
  | { op: 'holdNextRequest'; path: string }
  | { op: 'releaseFetch' }

export interface Snapshot {
  bookmarks: { id: string; url: string; title: string; json: Record<string, unknown>; updatedAt: string }[]
  lists: { id: string }[]
  meta: { pendingBookmarkIds: string[]; syncBookmarksCursor?: string; lastError?: string }
  owner: { ownerUserId?: string; switchBackup?: { fromUserId?: string; savedAt: number; json: string } }
  userId?: string
  needsAccountChoice: boolean
}

// Written by `bun scripts/sync-stack.ts start` in Inks.
function stackConnection(): { url?: string; anonKey?: string; serviceKey?: string } {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.inks-sync-stack.json'), 'utf8'))
  } catch {
    return {}
  }
}

export function localConfig() {
  const stack = stackConnection()
  const url = process.env.NORI_SYNC_URL ?? stack.url
  const anonKey = process.env.NORI_SYNC_ANON_KEY ?? stack.anonKey
  const serviceKey = process.env.NORI_SYNC_SERVICE_ROLE_KEY ?? stack.serviceKey
  if (!url || !anonKey || !serviceKey) throw new Error('Local sync tests need a stack: run `bun scripts/sync-stack.ts start` in Inks, or set NORI_SYNC_URL, NORI_SYNC_ANON_KEY, and NORI_SYNC_SERVICE_ROLE_KEY')
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Local sync tests require a loopback HTTP Supabase URL')
  }
  return { url, anonKey, serviceKey }
}
