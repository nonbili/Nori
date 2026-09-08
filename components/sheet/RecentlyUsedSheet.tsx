import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'

import { Sheet } from '@/components/modal/BaseModal'
import { Favicon } from '@/components/bookmark/Favicon'
import { showSnackbar, ui$ } from '@/states/ui'
import { history$ } from '@/states/history'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$ } from '@/states/lists'
import { openBookmark as openBookmarkAction } from '@/lib/open-bookmark'
import { getLiveBookmarks } from '@/lib/nori-data'

type HistoryTab = 'used' | 'added'

const RECENTLY_ADDED_LIMIT = 20

const getHostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const getCreatedAtMs = (value?: string) => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-xl px-3 py-2 ${
        active ? 'bg-contrast' : 'bg-transparent'
      }`}
    >
      <NoriText
        className={`text-xs font-medium ${
          active ? 'text-content-inverse' : 'text-content-muted'
        }`}
      >
        {label}
      </NoriText>
    </Pressable>
  )
}

function BookmarkRow({
  title,
  url,
  icon,
  listLabel,
  subtitle,
  trailing,
  onPress,
}: {
  title: string
  url: string
  icon: string
  listLabel?: string
  subtitle?: string
  trailing?: { label: string }
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <Favicon
        iconUrl={icon}
        pageUrl={url}
        slotSize={40}
        iconSize={24}
        fallbackIconSize={16}
        wrapperClassName="items-center justify-center overflow-hidden rounded-xl bg-muted"
      />
      <View className="flex-1">
        <NoriText className="text-sm font-medium text-content" numberOfLines={1}>
          {title}
        </NoriText>
        {listLabel ? (
          <View className="mt-1 flex-row items-center gap-2">
            <View className="rounded-full bg-accent-100 px-2 py-1 dark:bg-accent-950/40">
              <NoriText className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-800 dark:text-accent-300">
                {listLabel}
              </NoriText>
            </View>
            <NoriText className="min-w-0 flex-1 text-xs text-content-subtle" numberOfLines={1}>
              {subtitle || getHostLabel(url)}
            </NoriText>
          </View>
        ) : (
          <NoriText className="mt-1 text-xs text-content-subtle" numberOfLines={1}>
            {subtitle || getHostLabel(url)}
          </NoriText>
        )}
      </View>
      {trailing ? (
        <View className="rounded-full bg-muted px-2 py-1">
          <NoriText className="text-[10px] font-medium uppercase tracking-[0.12em] text-content-muted">
            {trailing.label}
          </NoriText>
        </View>
      ) : null}
    </Pressable>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View className="items-center px-6 py-10">
      <NoriText className="text-base font-semibold text-content">{title}</NoriText>
      <NoriText className="mt-2 text-center text-sm leading-6 text-content-subtle">{description}</NoriText>
    </View>
  )
}

export function RecentlyUsedSheet() {
  const { t } = useTranslation()
  const visible = useValue(ui$.recentSheetOpen)
  const recentlyUsed = useValue(history$.openedBookmarks)
  const allBookmarks = useValue(bookmarks$.bookmarks)
  const allLists = useValue(lists$.lists)
  const [tab, setTab] = useState<HistoryTab>('used')
  const listNameById = new Map(allLists.map((list) => [list.id, list.name]))

  const clearRecentHistory = () => {
    const snapshot = history$.openedBookmarks.get()
    history$.clearOpenedBookmarks()
    showSnackbar(t('history.cleared'), t('common.undo'), () => history$.restoreOpenedBookmarks(snapshot))
  }

  const recentlyAdded = getLiveBookmarks(allBookmarks)
    .filter((bookmark) => !bookmark.id.startsWith('builtin-'))
    .slice()
    .sort((a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt))
    .slice(0, RECENTLY_ADDED_LIMIT)

  return (
    <Sheet
      visible={visible}
      showCloseButton={false}
      height="60%"
      onClose={() => ui$.recentSheetOpen.set(false)}
    >
      <View className="flex-1 gap-4">
        <View className="flex-row gap-1 rounded-2xl bg-muted p-1">
          <TabButton label={t('history.used')} active={tab === 'used'} onPress={() => setTab('used')} />
          <TabButton label={t('history.added')} active={tab === 'added'} onPress={() => setTab('added')} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
          <View className="gap-4 pb-4">
            {tab === 'used' ? (
              recentlyUsed.length > 0 ? (
                <>
                  <View className="flex-row items-center justify-end">
                    <Pressable
                      onPress={clearRecentHistory}
                      className="rounded-lg px-2 py-1 active:bg-muted"
                    >
                      <NoriText className="text-xs font-medium text-content-subtle">{t('history.clearAction')}</NoriText>
                    </Pressable>
                  </View>
                  <View className="gap-2.5">
                    {recentlyUsed.map((bookmark) => {
                      return (
                        <BookmarkRow
                          key={bookmark.id}
                          title={bookmark.title}
                          url={bookmark.url}
                          icon={bookmark.icon}
                          trailing={{ label: t('history.reopen') }}
                          onPress={() => {
                            ui$.recentSheetOpen.set(false)
                            void openBookmarkAction(bookmark)
                          }}
                        />
                      )
                    })}
                  </View>
                </>
              ) : (
                <EmptyState
                  title={t('history.noRecent')}
                  description={t('history.noRecentHint')}
                />
              )
            ) : recentlyAdded.length > 0 ? (
              <View className="mt-2 gap-2.5">
                {recentlyAdded.map((bookmark) => (
                  <BookmarkRow
                    key={bookmark.id}
                    title={bookmark.title}
                    url={bookmark.url}
                    icon={bookmark.icon}
                    listLabel={listNameById.get(bookmark.listId) || t('lists.unknown')}
                    subtitle={getHostLabel(bookmark.url)}
                    onPress={() => {
                      ui$.recentSheetOpen.set(false)
                      void openBookmarkAction(bookmark)
                    }}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title={t('history.noBookmarks')}
                description={t('history.noBookmarksHint')}
              />
            )}
          </View>
        </ScrollView>
      </View>
    </Sheet>
  )
}
