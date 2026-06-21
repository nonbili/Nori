export interface OpenedBookmarkRecord {
  id: string
  url: string
  title: string
  icon: string
  openedAt: number
}

export function addOpenedBookmarkRecord(
  openedBookmarks: OpenedBookmarkRecord[],
  bookmark: { id: string; url: string; title: string; icon: string },
  openedAt = Date.now(),
) {
  const filtered = openedBookmarks.filter((item) => item.id !== bookmark.id)
  return [
    { ...bookmark, openedAt },
    ...filtered,
  ].slice(0, 10)
}

export function removeOpenedBookmarkRecord(openedBookmarks: OpenedBookmarkRecord[], id: string) {
  return openedBookmarks.filter((item) => item.id !== id)
}
