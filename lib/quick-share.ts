import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { getFallbackIcon, getFallbackTitle } from '@/lib/bookmark'
import { getPrefetchedBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { getVisibleLists } from '@/lib/nori-data'
import {
  configureQuickShare,
  getPendingAppShareLinks,
  getPendingQuickShareLinks,
  removePendingAppShareLinkIds,
  removePendingQuickShareLinkIds,
  type PendingQuickShareLink,
} from '@/modules/nori-quick-share'
import { ui$ } from '@/states/ui'

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function resolveQuickShareTargetListId(preferredListId = settings$.quickSaveShareListId.peek()) {
  const visibleLists = getVisibleLists(lists$.lists.peek())
  if (visibleLists.some((list) => list.id === preferredListId)) {
    return preferredListId
  }
  return visibleLists[0]?.id || ''
}

export async function syncQuickShareNativeConfig() {
  const targetListId = resolveQuickShareTargetListId()
  await configureQuickShare(settings$.quickSaveSharedLinks.peek() && !!targetListId, targetListId)
}

export function saveQuickSharedLink(url: string, targetListId = resolveQuickShareTargetListId()) {
  if (!targetListId || !isValidHttpUrl(url)) {
    return null
  }

  const title = getFallbackTitle(url)
  const icon = getFallbackIcon(url)
  const id = bookmarks$.add({ listId: targetListId, url, title, icon })
  if (!id) {
    return null
  }

  void getPrefetchedBookmarkMeta(url)
    .then((meta) => {
      if (meta.title || meta.icon) {
        bookmarks$.update(id, {
          title: meta.title || title,
          icon: meta.icon || icon,
        })
      }
    })
    .catch(() => {})

  return id
}

function drainEntry(entry: PendingQuickShareLink) {
  const targetListId = resolveQuickShareTargetListId(entry.targetListId)
  return saveQuickSharedLink(entry.url, targetListId)
}

export async function drainQuickShareInbox() {
  const pending = await getPendingQuickShareLinks()
  const importedIds: string[] = []

  for (const entry of pending) {
    if (drainEntry(entry)) {
      importedIds.push(entry.id)
    }
  }

  await removePendingQuickShareLinkIds(importedIds)
  return importedIds.length
}

export async function drainAppShareInbox() {
  const pending = await getPendingAppShareLinks()
  const handledIds: string[] = []
  const entry = pending[0]

  if (entry?.url && isValidHttpUrl(entry.url)) {
    ui$.pendingBookmarkImport.set(null)
    ui$.pendingShare.set({
      url: entry.url,
      title: getFallbackTitle(entry.url),
      icon: getFallbackIcon(entry.url),
    })
    handledIds.push(entry.id)
  }

  await removePendingAppShareLinkIds(handledIds)
  return handledIds.length
}
