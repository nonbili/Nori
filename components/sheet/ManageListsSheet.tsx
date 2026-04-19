import { Alert, Pressable, Text, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$, type BookmarkList } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { getInactiveLists, getVisibleLists } from '@/lib/nori-data'
import { showToast } from '@/lib/toast'
import { useThemeColors } from '@/lib/theme'
import { useColorScheme } from 'nativewind'
import { ManageRow, SectionLabel } from '@/components/common/Common'
import { Sheet } from '@/components/modal/BaseModal'
import { SortableList } from '@/components/common/SortableList'
import { NouMenu } from '@/components/menu/NouMenu'
import { GestureDetector } from 'react-native-gesture-handler'

export const ManageListsSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const lists = useValue(lists$.lists)
  const visible = useValue(ui$.listManagerOpen)
  const visibleLists = getVisibleLists(lists)
  const inactiveLists = getInactiveLists(lists)

  const toggleList = (list: BookmarkList, visible: boolean) => {
    lists$.setVisible(list.id, visible)
    if (visible) {
      settings$.setLastSelectedListId(list.id)
    }
  }

  const deleteList = (list: BookmarkList) => {
    Alert.alert(
      t('lists.deleteTitle'),
      t('lists.deleteBody', { name: list.name }),
      [
        { text: t('lists.cancel'), style: 'cancel' },
        {
          text: t('lists.delete'),
          style: 'destructive',
          onPress: () => {
            bookmarks$.deleteByListId(list.id)
            if (lists$.deleteList(list.id)) {
              showToast(t('lists.deleted'))
            }
          },
        },
      ],
    )
  }

  const handleReorder = (orderedIds: string[]) => {
    const inactiveIds = inactiveLists.map((l) => l.id)
    lists$.reorder([...orderedIds, ...inactiveIds])
  }

  return (
    <Sheet
      visible={visible}
      title={t('lists.manage')}
      onClose={() => ui$.listManagerOpen.set(false)}
      headerLeft={
        <Pressable
          onPress={() => ui$.listEditor.set({ name: '' })}
          className="rounded-full bg-stone-900 px-3 py-1.5 active:opacity-70 dark:bg-stone-100"
        >
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons name="add" color={isDark ? '#0c0a09' : '#fafaf9'} size={16} />
            <Text className="text-xs font-bold text-stone-50 dark:text-stone-950">{t('lists.new')}</Text>
          </View>
        </Pressable>
      }
    >
      <View className="gap-8">
        <View className="gap-4">
          <SortableList
            items={visibleLists}
            itemHeight={64}
            gap={12}
            onReorder={handleReorder}
            dragHandleOnly
            renderItem={(list, isDragging, dragGesture) => (
              <ManageRow
                title={list.name}
                className={isDragging ? 'opacity-50' : ''}
                left={
                  <GestureDetector gesture={dragGesture}>
                    <View className="mr-1 items-center justify-center p-2">
                      <MaterialIcons name="drag-handle" size={20} color={themeColors.iconMuted} />
                    </View>
                  </GestureDetector>
                }
                actions={
                  <NouMenu
                    items={[
                      {
                        label: t('lists.renameAction'),
                        icon: 'edit',
                        handler: () => ui$.listEditor.set({ id: list.id, name: list.name }),
                      },
                      {
                        label: t('lists.hide'),
                        icon: 'visibility-off',
                        handler: () => toggleList(list, false),
                      },
                      {
                        label: t('lists.delete'),
                        icon: 'delete',
                        handler: () => deleteList(list),
                      },
                    ]}
                    trigger={
                      <View className="rounded-full bg-stone-200 p-2 dark:bg-stone-800">
                        <MaterialIcons name="more-vert" size={20} color={themeColors.iconMuted} />
                      </View>
                    }
                  />
                }
              />
            )}
          />
        </View>

        {inactiveLists.length ? (
          <View className="gap-4">
            <SectionLabel title={t('lists.hidden')} />
            <View className="gap-3">
              {inactiveLists.map((list) => (
                <ManageRow
                  key={list.id}
                  title={list.name}
                  actions={
                    <NouMenu
                      items={[
                        {
                          label: t('lists.renameAction'),
                          icon: 'edit',
                          handler: () => ui$.listEditor.set({ id: list.id, name: list.name }),
                        },
                        {
                          label: t('lists.show'),
                          icon: 'visibility',
                          handler: () => toggleList(list, true),
                        },
                        {
                          label: t('lists.delete'),
                          icon: 'delete',
                          handler: () => deleteList(list),
                        },
                      ]}
                      trigger={
                        <View className="rounded-full bg-stone-200 p-2 dark:bg-stone-800">
                          <MaterialIcons name="more-vert" size={20} color={themeColors.iconMuted} />
                        </View>
                      }
                    />
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
