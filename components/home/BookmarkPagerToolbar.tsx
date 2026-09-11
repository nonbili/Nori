import { useEffect, useRef } from 'react'
import { Pressable, View, type LayoutChangeEvent } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ui$ } from '@/states/ui'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { showToast } from '@/lib/toast'
import type { BookmarkPagerActions } from '@/components/home/BookmarkPagerParts'

const ToolbarIconButton: React.FC<{
  icon: MaterialIconsIconName
  color: string
  label: string
  danger?: boolean
  testID?: string
  onPress: () => void
}> = ({ icon, color, label, danger, testID, onPress }) => (
  <Pressable
    onPress={onPress}
    testID={testID}
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
  additionalMenuItems?: NouMenuItem[]
  onOpenSettings?: () => void
  actions: BookmarkPagerActions
}> = ({
  selectedCount,
  allVisibleSelected,
  hasVisibleBookmarks,
  moveTargetLists,
  additionalMenuItems = [],
  onOpenSettings,
  actions,
}) => {
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

  const toggleEditMode = () => {
    ui$.bookmarkEditMode.set(!bookmarkEditMode)
    ui$.selectedBookmarkIds.set([])
  }

  // Everything the old top header offered lives in this menu now, so the bar
  // keeps only the actions worth a permanent tap target.
  const menuItems: NouMenuItem[] = [
    { label: t('lists.manage'), icon: 'view-list', handler: () => ui$.listManagerOpen.set(true) },
    ...additionalMenuItems,
    {
      label: t('settings.title'),
      icon: 'settings',
      handler: onOpenSettings ?? (() => ui$.settingsSheetOpen.set(true)),
    },
  ]

  // Browsing: drawer and history on the left, the primary add action in the
  // middle, then edit mode and the overflow menu.
  const browseBar = (
    <View className="flex-1 flex-row items-center justify-between">
      <ToolbarIconButton
        icon="bookmarks"
        color={themeColors.content}
        label={t('bookmarks.openDrawer')}
        testID="drawer_button"
        onPress={() => ui$.openBookmarksDrawer()}
      />
      <ToolbarIconButton
        icon="history"
        color={themeColors.content}
        label={t('history.openHistory')}
        testID="history_button"
        onPress={() => ui$.recentSheetOpen.set(true)}
      />
      <Pressable
        onPress={actions.onOpenNewBookmark}
        testID="add_bookmark_button"
        accessibilityLabel={t('bookmarks.add')}
        accessibilityRole="button"
        className="items-center justify-center rounded-full bg-accent-600 active:bg-accent-700"
        style={{ height: 52, width: 52 }}
      >
        <MaterialIcons name="add" size={26} color="#ffffff" />
      </Pressable>
      <ToolbarIconButton
        icon="edit"
        color={themeColors.content}
        label={t('bookmarks.editMultiple')}
        testID="edit_mode_button"
        onPress={toggleEditMode}
      />
      <NouMenu
        items={menuItems}
        testID="toolbar_menu_button"
        accessibilityLabel={t('settings.moreOptions')}
        trigger={
          <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
            <MaterialIcons name="more-vert" size={20} color={themeColors.content} />
          </View>
        }
      />
    </View>
  )

  // With a selection the bar turns into a selection bar: a count that doubles as
  // select-all, then icon-only actions, so the row stays readable on narrow phones.
  const selectionBar = (
    <View className="flex-1 flex-row items-center justify-between">
      <Pressable
        onPress={actions.onSelectAll}
        disabled={!hasVisibleBookmarks}
        accessibilityLabel={allVisibleSelected ? t('bookmarks.deselectAll') : t('bookmarks.selectAll')}
        accessibilityRole="button"
        className={`h-11 flex-row items-center gap-1.5 rounded-full bg-muted px-3 active:bg-muted-strong ${hasVisibleBookmarks ? '' : 'opacity-40'}`}
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
      <Pressable
        onPress={toggleEditMode}
        testID="done_editing_button"
        accessibilityLabel={t('bookmarks.doneEditing')}
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center rounded-full bg-accent-600 active:bg-accent-700"
      >
        <MaterialIcons name="check" size={20} color="#ffffff" />
      </Pressable>
    </View>
  )

  return (
    <View
      testID="bookmark_toolbar"
      className="absolute left-6 right-6 z-10"
      style={{ bottom: insets.bottom + 16 }}
      onLayout={onToolbarLayout}
    >
      <View
        className="flex-row items-center rounded-full border border-white/70 bg-surface/70 px-2 py-2 shadow-lg dark:border-white/10 dark:bg-canvas/70"
        style={{ shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 16 }}
      >
        {bookmarkEditMode ? selectionBar : browseBar}
      </View>
    </View>
  )
}
