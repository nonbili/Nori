import { Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useValue } from '@legendapp/state/react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getVisibleLists } from '@/lib/nori-data'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { useThemeColors } from '@/lib/theme'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { HEADER_TOP_OFFSET } from './headerLayout'

export const AppHeader: React.FC<{
  additionalMenuItems?: NouMenuItem[]
  onOpenSettings?: () => void
}> = ({ additionalMenuItems = [], onOpenSettings }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const insets = useSafeAreaInsets()
  const lists = useValue(lists$.lists)
  const selectedListId = useValue(settings$.lastSelectedListId)
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const visibleLists = getVisibleLists(lists)
  const selectedList = useMemo(
    () => visibleLists.find((item) => item.id === selectedListId) || visibleLists[0] || null,
    [selectedListId, visibleLists],
  )
  const menuItems = [
    { label: t('lists.manage'), icon: 'view-list' as const, handler: () => ui$.listManagerOpen.set(true) },
    ...(selectedList
      ? [
          {
            label: bookmarkEditMode ? t('bookmarks.doneEditing') : t('bookmarks.editMultiple'),
            icon: bookmarkEditMode ? ('check' as const) : ('edit-note' as const),
            handler: () => {
              ui$.bookmarkEditMode.set(!bookmarkEditMode)
              ui$.selectedBookmarkIds.set([])
            },
          },
        ]
      : []),
    ...additionalMenuItems,
    {
      label: t('settings.title'),
      icon: 'settings' as const,
      handler: onOpenSettings ?? (() => ui$.settingsSheetOpen.set(true)),
    },
  ]

  return (
    <View testID="app_header" className="flex-row items-center justify-between px-6 pb-2" style={{ paddingTop: insets.top + HEADER_TOP_OFFSET }}>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => ui$.openBookmarksDrawer()}
          testID="drawer_button"
          accessibilityLabel={t('bookmarks.openDrawer')}
          className="h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
        >
          <MaterialIcons name="bookmarks" size={20} color={themeColors.icon} />
        </Pressable>
      </View>
      <View className="flex-row gap-4">
        <Pressable
          onPress={() => ui$.recentSheetOpen.set(true)}
          testID="history_button"
          accessibilityLabel={t('history.openHistory')}
          className="h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
        >
          <MaterialIcons name="history" size={20} color={themeColors.icon} />
        </Pressable>
        <NouMenu
          items={menuItems}
          testID="header_menu_button"
          accessibilityLabel={t('settings.moreOptions')}
          trigger={
            <View className="h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800">
              <MaterialIcons name="more-vert" size={20} color={themeColors.icon} />
            </View>
          }
        />
      </View>
    </View>
  )
}
