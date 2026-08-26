import type { BookmarkListData, BookmarkRecordData } from '../nori-data'

export interface RemoteListRow {
  id: string
  name: string
  json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface RemoteBookmarkRow {
  id: string
  list_id: string
  url: string
  title: string
  icon: string
  json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export function toLocalList(row: RemoteListRow): BookmarkListData {
  return {
    id: row.id,
    name: row.name,
    json: row.json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toLocalBookmark(row: RemoteBookmarkRow): BookmarkRecordData {
  return {
    id: row.id,
    listId: row.list_id,
    url: row.url,
    title: row.title,
    icon: row.icon,
    json: row.json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toRemoteList(userId: string, row: BookmarkListData) {
  return { user_id: userId, id: row.id, name: row.name, json: row.json }
}

export function toRemoteBookmark(userId: string, row: BookmarkRecordData) {
  return {
    user_id: userId,
    id: row.id,
    list_id: row.listId,
    url: row.url,
    title: row.title,
    icon: row.icon,
    json: row.json,
  }
}

export function toBatches<T>(rows: T[], size: number) {
  const batches: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size))
  }
  return batches
}
