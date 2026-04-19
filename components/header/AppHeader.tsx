import { Pressable, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useMemo } from 'react'
import { useValue } from '@legendapp/state/react'
import { getVisibleLists } from '@/lib/nori-data'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { useThemeColors } from '@/lib/theme'
import { NouMenu } from '@/components/menu/NouMenu'
import { HEADER_TOP_OFFSET } from './headerLayout'

export const AppHeader: React.FC = () => {
  const themeColors = useThemeColors()
  const lists = useValue(lists$.lists)
  const selectedListId = useValue(settings$.lastSelectedListId)
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const visibleLists = getVisibleLists(lists)
  const selectedList = useMemo(
    () => visibleLists.find((item) => item.id === selectedListId) || visibleLists[0] || null,
    [selectedListId, visibleLists],
  )
  const menuItems = [
    { label: 'Manage lists', icon: 'view-list' as const, handler: () => ui$.listManagerOpen.set(true) },
    ...(selectedList
      ? [
          {
            label: bookmarkEditMode ? 'Done editing bookmarks' : 'Edit bookmarks',
            icon: (bookmarkEditMode ? 'check' : 'edit-note') as const,
            handler: () => {
              ui$.bookmarkEditMode.set(!bookmarkEditMode)
              ui$.selectedBookmarkId.set(null)
            },
          },
        ]
      : []),
    { label: 'Settings', icon: 'settings' as const, handler: () => ui$.settingsSheetOpen.set(true) },
  ]

  return (
    <View testID="app_header" className="flex-row items-center justify-between px-6 pb-2" style={{ paddingTop: HEADER_TOP_OFFSET }}>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => ui$.drawerOpen.set(true)}
          testID="drawer_button"
          accessibilityLabel="Open bookmarks drawer"
          className="h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
        >
          <MaterialIcons name="bookmarks" size={20} color={themeColors.icon} />
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => ui$.recentSheetOpen.set(true)}
          testID="history_button"
          accessibilityLabel="Open history"
          className="h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
        >
          <MaterialIcons name="history" size={20} color={themeColors.icon} />
        </Pressable>
        <NouMenu
          items={menuItems}
          testID="header_menu_button"
          accessibilityLabel="More options"
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
