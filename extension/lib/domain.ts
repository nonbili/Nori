import { addBookmarkRecord } from 'nori/lib/bookmark-mutations'
import { getMeta } from 'nori/lib/bookmark'
import { getDuckDuckGoIcon } from 'nori/lib/favicon'
import {
  createStarterBookmarks,
  createStarterLists,
  getTags,
  getVisibleLists,
  isDeleted,
  isVisible,
  patchRowState,
} from 'nori/lib/nori-data'
import { parseHttpUrl } from 'nori/lib/url'
import { mergeSyncRows } from 'nori/lib/supabase/sync-merge'
import type { BookmarkDraft, NoriBookmark, ProfileData } from './model'

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export { isDeleted, isVisible }
export const tagsOf = getTags

export function normalizeUrl(value: string) {
  try {
    return parseHttpUrl(value).toString()
  } catch {
    return ''
  }
}

export const faviconFor = getDuckDuckGoIcon

export async function resolveBookmarkMetadata(urlValue: string, titleValue = '', iconValue = '', resolver = getMeta) {
  const title = titleValue.trim()
  const icon = iconValue.trim()
  if (title) return { title, icon }

  const url = normalizeUrl(urlValue)
  if (!url) return { title, icon }

  const metadata = await resolver(url)
  return {
    title: metadata.title,
    icon: icon || metadata.icon,
  }
}

export function createProfile(ownerId?: string, email?: string): ProfileData {
  return {
    ownerId,
    email,
    lists: createStarterLists(),
    bookmarks: createStarterBookmarks(),
    history: [],
    pendingListIds: [],
    pendingBookmarkIds: [],
  }
}

export const liveLists = (profile: ProfileData) => getVisibleLists(profile.lists)

export function liveBookmarks(profile: ProfileData) {
  return profile.bookmarks
    .filter((item) => !isDeleted(item) && isVisible(item))
    .sort((a, b) => Number(a.json.sort_index ?? 0) - Number(b.json.sort_index ?? 0))
}

export function saveBookmark(profile: ProfileData, draft: BookmarkDraft) {
  const url = normalizeUrl(draft.url)
  if (!url || !liveLists(profile).some((list) => list.id === draft.listId)) throw new Error('Invalid bookmark')
  const id = uid()
  const result = addBookmarkRecord(
    profile.lists,
    profile.bookmarks,
    { ...draft, url, icon: draft.icon || faviconFor(url), tags: cleanTags(draft.tags) },
    id,
    now(),
  )
  if (!result) throw new Error('Invalid bookmark')
  profile.bookmarks = result.bookmarks
  mark(profile.pendingBookmarkIds, result.id)
  return result.id
}

export function cleanTags(tags?: string[]) {
  return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))]
}

export function mark(ids: string[], id: string) {
  if (!ids.includes(id)) ids.push(id)
}

export function tombstone<T extends { id: string; json: Record<string, unknown>; updatedAt: string }>(
  rows: T[],
  pending: string[],
  id: string,
) {
  const row = rows.find((item) => item.id === id)
  if (!row) return
  const timestamp = now()
  row.json = patchRowState(row, { visible: false, deleted_at: timestamp }).json
  row.updatedAt = timestamp
  mark(pending, id)
}

export const mergeRows = <T extends { id: string; updatedAt: string }>(local: T[], remote: T[], pending: string[]) =>
  mergeSyncRows(local, remote, new Set(pending))

export function reorder<T extends { id: string; json: Record<string, unknown>; updatedAt: string }>(
  rows: T[],
  ids: string[],
  pending: string[],
) {
  const timestamp = now()
  const ordered = ids.map((id) => rows.find((item) => item.id === id)).filter((item): item is T => item != null)
  const missing = rows.filter((item) => !ids.includes(item.id))
  const next = [...ordered, ...missing]
  next.forEach((row, index) => {
    row.json = patchRowState(row, { sort_index: index }).json
    row.updatedAt = timestamp
    mark(pending, row.id)
  })
  rows.splice(0, rows.length, ...next)
}
