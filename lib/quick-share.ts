import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { getFallbackIcon, getFallbackTitle } from '@/lib/bookmark'
import { getPrefetchedBookmarkMeta } from '@/lib/bookmark-meta-cache'
import { isValidQuickShareHttpUrl, resolveQuickShareTargetListIdFromLists } from '@/lib/quick-share-utils'
import {
  configureQuickShare,
  getPendingAppShareLinks,
  getPendingQuickShareLinks,
  removePendingAppShareLinkIds,
  removePendingQuickShareLinkIds,
  type PendingQuickShareLink,
} from '@/modules/nori-quick-share'
import { ui$ } from '@/states/ui'

export function resolveQuickShareTargetListId(preferredListId = settings$.quickSaveShareListId.peek()) {
  return resolveQuickShareTargetListIdFromLists(lists$.lists.peek(), preferredListId)
}

export async function syncQuickShareNativeConfig() {
  const targetListId = resolveQuickShareTargetListId()
  await configureQuickShare(settings$.quickSaveSharedLinks.peek() && !!targetListId, targetListId)
}

export function saveQuickSharedLink(url: string, targetListId = resolveQuickShareTargetListId()) {
  if (!targetListId || !isValidQuickShareHttpUrl(url)) {
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
  if (pending.length === 0) {
    return 0
  }

  const items = pending
    .filter((entry) => entry.url && isValidQuickShareHttpUrl(entry.url))
    .map((entry) => ({
      url: entry.url,
      title: getFallbackTitle(entry.url),
      icon: getFallbackIcon(entry.url),
    }))

  if (items.length > 0) {
    ui$.pendingBookmarkImport.set(null)
    ui$.pendingShare.set({ items })
  }

  // Drop every entry, including the ones without a usable URL, so a share we cannot
  // handle doesn't stay at the head of the inbox and shadow later ones.
  await removePendingAppShareLinkIds(pending.map((entry) => entry.id))
  return items.length
}
