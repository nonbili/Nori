import { useEffect, useRef } from 'react'
import { Pressable, View, type LayoutChangeEvent } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import { useTranslation } from 'react-i18next'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ui$ } from '@/states/ui'
import { NouMenu } from '@/components/menu/NouMenu'
import { GlassPill } from '@/components/home/GlassPill'
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
    className={`h-10 w-10 items-center justify-center rounded-full ${
      danger ? 'active:bg-danger-100 dark:active:bg-danger-900/40' : 'active:bg-muted'
    }`}
  >
    <MaterialIcons name={icon} size={22} color={color} />
  </Pressable>
)

export const BookmarkPagerToolbar: React.FC<{
  selectedCount: number
  allVisibleSelected: boolean
  hasVisibleBookmarks: boolean
  moveTargetLists: { id: string; name: string }[]
  onOpenSettings?: () => void
  actions: BookmarkPagerActions
}> = ({
  selectedCount,
  allVisibleSelected,
  hasVisibleBookmarks,
  moveTargetLists,
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

  // Browsing, split 1-3-1: the drawer alone, history/add/edit grouped in the
  // middle, and settings alone.
  const browseBar = (
    <>
      <GlassPill>
        <ToolbarIconButton
          icon="bookmarks"
          color={themeColors.content}
          label={t('bookmarks.openDrawer')}
          testID="drawer_button"
          onPress={() => ui$.openBookmarksDrawer()}
        />
      </GlassPill>
      <GlassPill gap="gap-4">
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
          className="h-10 w-10 items-center justify-center rounded-full bg-accent-fill active:bg-accent-fill-pressed"
        >
          <MaterialIcons name="add" size={22} color={themeColors.onAccent} />
        </Pressable>
        <ToolbarIconButton
          icon="edit"
          color={themeColors.content}
          label={t('bookmarks.editMultiple')}
          testID="edit_mode_button"
          onPress={toggleEditMode}
        />
      </GlassPill>
      <GlassPill>
        <ToolbarIconButton
          icon="settings"
          color={themeColors.content}
          label={t('settings.title')}
          testID="toolbar_settings_button"
          onPress={onOpenSettings ?? (() => ui$.settingsSheetOpen.set(true))}
        />
      </GlassPill>
    </>
  )

  // With a selection the bar turns into a selection bar, split the same way: a
  // count that doubles as select-all, the icon-only actions, then done. Its six
  // targets are packed tight (no gaps, narrower margins) so it fits 320px screens.
  // Only the count pill may shrink, so a long count or large text never pushes
  // Done out of the toolbar.
  const selectionBar = (
    <>
      <GlassPill className="min-w-0 shrink">
        <Pressable
          onPress={actions.onSelectAll}
          disabled={!hasVisibleBookmarks}
          accessibilityLabel={allVisibleSelected ? t('bookmarks.deselectAll') : t('bookmarks.selectAll')}
          accessibilityRole="button"
          className={`h-10 min-w-0 shrink flex-row items-center gap-1 rounded-full px-2 active:bg-muted ${hasVisibleBookmarks ? '' : 'opacity-40'}`}
        >
          <MaterialIcons
            name={allVisibleSelected ? 'check-box' : 'check-box-outline-blank'}
            size={20}
            color={themeColors.content}
          />
          <NoriText numberOfLines={1} className="shrink text-sm font-medium text-content">
            {selectedCount > 99 ? '99+' : selectedCount}
          </NoriText>
        </Pressable>
      </GlassPill>
      <GlassPill gap="gap-0">
        {moveTargetLists.length ? (
          <NouMenu
            accessibilityLabel={t('bookmarks.moveTo')}
            items={moveTargetLists.map((list) => ({
              id: list.id,
              label: list.name,
              handler: () => actions.onMoveSelectedToList(list.id),
            }))}
            trigger={
              <View className="h-10 w-10 items-center justify-center rounded-full">
                <MaterialIcons name="drive-file-move" size={22} color={themeColors.content} />
              </View>
            }
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
      </GlassPill>
      <GlassPill>
        <Pressable
          onPress={toggleEditMode}
          testID="done_editing_button"
          accessibilityLabel={t('bookmarks.doneEditing')}
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full bg-accent-fill active:bg-accent-fill-pressed"
        >
          <MaterialIcons name="check" size={20} color={themeColors.onAccent} />
        </Pressable>
      </GlassPill>
    </>
  )

  return (
    <View
      testID="bookmark_toolbar"
      className={`absolute z-10 ${bookmarkEditMode ? 'left-4 right-4' : 'left-6 right-6'}`}
      style={{ bottom: insets.bottom + 16 }}
      onLayout={onToolbarLayout}
    >
      <View className="flex-row items-center justify-between">{bookmarkEditMode ? selectionBar : browseBar}</View>
    </View>
  )
}
