import { getVisibleLists, type BookmarkListData } from '@/lib/nori-data'

export const isValidQuickShareHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function resolveQuickShareTargetListIdFromLists(
  lists: BookmarkListData[],
  preferredListId: string,
) {
  const visibleLists = getVisibleLists(lists)
  if (visibleLists.some((list) => list.id === preferredListId)) {
    return preferredListId
  }
  return visibleLists[0]?.id || ''
}
