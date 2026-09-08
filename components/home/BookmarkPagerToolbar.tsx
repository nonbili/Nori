import { useEffect, useRef } from 'react'
import { Pressable, View, type LayoutChangeEvent } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ui$ } from '@/states/ui'
import { NouMenu } from '@/components/menu/NouMenu'
import { showToast } from '@/lib/toast'
import type { BookmarkPagerActions } from '@/components/home/BookmarkPagerParts'

const ToolbarIconButton: React.FC<{
  icon: MaterialIconsIconName
  color: string
  label: string
  danger?: boolean
  onPress: () => void
}> = ({ icon, color, label, danger, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityLabel={label}
    accessibilityRole="button"
    className={`h-11 w-11 items-center justify-center rounded-full ${
      danger
        ? 'bg-danger-100 active:bg-danger-200 dark:bg-danger-900/40 dark:active:bg-danger-900/60'
        : 'bg-muted active:bg-muted-strong'
    }`}
  >
    <MaterialIcons name={icon} size={20} color={color} />
  </Pressable>
)

export const BookmarkPagerToolbar: React.FC<{
  selectedCount: number
  allVisibleSelected: boolean
  hasVisibleBookmarks: boolean
  moveTargetLists: { id: string; name: string }[]
  actions: BookmarkPagerActions
}> = ({ selectedCount, allVisibleSelected, hasVisibleBookmarks, moveTargetLists, actions }) => {
  const { t } = useTranslation()
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const insets = useSafeAreaInsets()
  const { themeColors } = actions
  const toolbarResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The snackbar stack reads this so an undo action never lands on the toolbar.
  useEffect(() => {
    if (toolbarResetTimerRef.current) {
      clearTimeout(toolbarResetTimerRef.current)
      toolbarResetTimerRef.current = null
    }
    return () => {
      // Deferring lets a Strict Mode effect replay cancel the reset while a
      // real unmount still clears the toolbar's reserved snackbar space.
      toolbarResetTimerRef.current = setTimeout(() => ui$.bookmarkToolbarHeight.set(0), 0)
    }
  }, [])
  const onToolbarLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height)
    if (ui$.bookmarkToolbarHeight.peek() !== height) {
      ui$.bookmarkToolbarHeight.set(height)
    }
  }

  // With a selection the bar turns into a selection bar: a count that doubles as
  // select-all, then icon-only actions, so the row stays readable on narrow phones.
  const selectionBar = (
    <View className="flex-1 flex-row items-center justify-between pr-3">
      <Pressable
        onPress={actions.onSelectAll}
        accessibilityLabel={allVisibleSelected ? t('bookmarks.deselectAll') : t('bookmarks.selectAll')}
        accessibilityRole="button"
        className="h-11 flex-row items-center gap-1.5 rounded-full bg-muted px-3 active:bg-muted-strong"
      >
        <MaterialIcons
          name={allVisibleSelected ? 'check-box' : 'check-box-outline-blank'}
          size={20}
          color={themeColors.content}
        />
        <NoriText className="text-sm font-medium text-content">{selectedCount}</NoriText>
      </Pressable>
      {moveTargetLists.length ? (
        <NouMenu
          accessibilityLabel={t('bookmarks.moveTo')}
          items={moveTargetLists.map((list) => ({
            id: list.id,
            label: list.name,
            handler: () => actions.onMoveSelectedToList(list.id),
          }))}
          trigger={(
            <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
              <MaterialIcons name="drive-file-move" size={20} color={themeColors.content} />
            </View>
          )}
        />
      ) : (
        <View className="opacity-40">
          <ToolbarIconButton
            icon="drive-file-move"
            color={themeColors.content}
            label={t('bookmarks.moveTo')}
            onPress={() => showToast(t('bookmarks.noOtherLists'))}
          />
        </View>
      )}
      <ToolbarIconButton
        icon="visibility-off"
        color={themeColors.content}
        label={t('bookmarks.hide')}
        onPress={actions.onHideSelected}
      />
      <ToolbarIconButton
        icon="share"
        color={themeColors.content}
        label={t('bookmarks.share')}
        onPress={actions.onShareSelected}
      />
      <ToolbarIconButton
        icon="delete"
        color={themeColors.danger}
        label={t('bookmarks.delete')}
        danger
        onPress={actions.onRemoveSelectedBookmark}
      />
    </View>
  )

  return (
    <View className="absolute left-6 right-6 z-10" style={{ bottom: insets.bottom + 16 }} onLayout={onToolbarLayout}>
      <View
        className="flex-row items-center justify-between rounded-full border border-white/70 bg-surface/70 px-3 py-2 shadow-lg dark:border-white/10 dark:bg-canvas/70"
        style={{ shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 16 }}
      >
        {bookmarkEditMode ? (
          selectedCount > 0 ? selectionBar : (
            <Pressable
              onPress={actions.onSelectAll}
              disabled={!hasVisibleBookmarks}
              className={`h-10 items-center justify-center rounded-full bg-muted px-4 active:bg-muted-strong ${hasVisibleBookmarks ? '' : 'opacity-40'}`}
            >
              <NoriText className="text-sm font-medium text-content">{t('bookmarks.selectAll')}</NoriText>
            </Pressable>
          )
        ) : (
          <Pressable onPress={actions.onOpenNewBookmark} className="h-10 w-10 items-center justify-center rounded-full bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15">
            <MaterialIcons name="add" size={20} color={themeColors.contentMuted} />
          </Pressable>
        )}
        {!bookmarkEditMode ? (
          <Pressable onPress={() => ui$.openBookmarksDrawer()} className="h-10 items-center justify-center px-4">
            <View className="h-1 w-12 rounded-full bg-muted-strong/90 dark:bg-white/20" />
            <MaterialIcons name="keyboard-arrow-up" size={24} color={themeColors.contentMuted} />
          </Pressable>
        ) : selectedCount > 0 ? null : <View className="h-10 w-2" />}
        <Pressable
          onPress={() => {
            ui$.bookmarkEditMode.set(!bookmarkEditMode)
            ui$.selectedBookmarkIds.set([])
          }}
          className={`h-10 w-10 items-center justify-center rounded-full ${bookmarkEditMode ? 'bg-accent-600 active:bg-accent-700' : 'bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15'}`}
        >
          <MaterialIcons name={bookmarkEditMode ? 'check' : 'edit'} size={18} color={bookmarkEditMode ? '#ffffff' : themeColors.contentMuted} />
        </Pressable>
      </View>
    </View>
  )
}
