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

export function restoreOpenedBookmarkRecords(
  current: OpenedBookmarkRecord[],
  snapshot: OpenedBookmarkRecord[],
) {
  const byId = new Map(snapshot.map((bookmark) => [bookmark.id, bookmark]))
  for (const bookmark of current) {
    byId.set(bookmark.id, bookmark)
  }
  return [...byId.values()]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, 10)
}
