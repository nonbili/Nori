import { createStarterBookmarks, createStarterLists } from 'nori/lib/nori-data'
import { mergeSyncRows } from 'nori/lib/supabase/sync-merge'
import type { ProfileData } from './model'

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

export const mergeRows = <T extends { id: string; updatedAt: string }>(local: T[], remote: T[], pending: string[]) =>
  mergeSyncRows(local, remote, new Set(pending))
