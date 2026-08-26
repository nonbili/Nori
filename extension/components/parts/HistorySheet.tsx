import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../AppContext'
import { Favicon } from '../Favicon'
import { Sheet } from '../Overlays'
import { showSnackbar } from '../Snackbar'
import { createdAtMs, hostLabel } from '../../lib/format'
import type { HistoryItem, NoriBookmark } from '../../lib/model'

const RECENTLY_ADDED_LIMIT = 20

function Row({
  bookmark,
  listLabel,
  trailing,
  onClick,
}: {
  bookmark: Pick<NoriBookmark, 'icon' | 'title' | 'url'>
  listLabel?: string
  trailing?: string
  onClick: () => void
}) {
  const { snapshot } = useApp()
  return (
    <button type="button" className="history-row" onClick={onClick}>
      <Favicon bookmark={bookmark} enabled={snapshot.preferences.showFavicons} variant="row" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{bookmark.title}</span>
        <span className="mt-1 flex items-center gap-2">
          {listLabel ? <span className="list-badge">{listLabel}</span> : null}
          <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{hostLabel(bookmark.url)}</span>
        </span>
      </span>
      {trailing ? <span className="row-badge">{trailing}</span> : null}
    </button>
  )
}

export function HistorySheet({
  onClose,
  onOpenBookmark,
  onOpenUrl,
}: {
  onClose: () => void
  onOpenBookmark: (bookmark: NoriBookmark) => void
  onOpenUrl: (item: HistoryItem) => void
}) {
  const { t } = useTranslation()
  const { snapshot, bookmarks, mutate } = useApp()
  const [tab, setTab] = useState<'used' | 'added'>('used')
  const history = snapshot.profile.history
  const listNames = useMemo(
    () => new Map(snapshot.profile.lists.map((list) => [list.id, list.name])),
    [snapshot.profile.lists],
  )
  const recentlyAdded = useMemo(
    () =>
      bookmarks
        .filter((bookmark) => !bookmark.id.startsWith('builtin-'))
        .slice()
        .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
        .slice(0, RECENTLY_ADDED_LIMIT),
    [bookmarks],
  )

  const clearHistory = async () => {
    const items = [...history]
    await mutate({ type: 'clear-history' })
    showSnackbar(t('historyCleared'), t('undo'), () => void mutate({ type: 'restore-history', items }))
  }

  return (
    <Sheet onClose={onClose} showHeader={false} height="72%">
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-2">
        <div className="tab-bar">
          <button className={tab === 'used' ? 'active' : ''} onClick={() => setTab('used')}>
            {t('historyUsed')}
          </button>
          <button className={tab === 'added' ? 'active' : ''} onClick={() => setTab('added')}>
            {t('historyAdded')}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'used' ? (
            history.length ? (
              <div className="grid gap-2.5 pb-2">
                <div className="flex justify-end">
                  <button className="text-button" onClick={() => void clearHistory()}>
                    {t('clearHistory')}
                  </button>
                </div>
                {history.map((item) => (
                  <Row key={item.id} bookmark={item} trailing={t('reopen')} onClick={() => onOpenUrl(item)} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>{t('noRecent')}</strong>
                <small>{t('noRecentHint')}</small>
              </div>
            )
          ) : recentlyAdded.length ? (
            <div className="grid gap-2.5 pb-2">
              {recentlyAdded.map((bookmark) => (
                <Row
                  key={bookmark.id}
                  bookmark={bookmark}
                  listLabel={listNames.get(bookmark.listId) || t('unknownList')}
                  onClick={() => onOpenBookmark(bookmark)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>{t('noRecentAdded')}</strong>
              <small>{t('noRecentAddedHint')}</small>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
