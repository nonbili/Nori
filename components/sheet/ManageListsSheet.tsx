import { Pressable, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureDetector, ScrollView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { useRef } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { bookmarks$ } from '@/states/bookmarks'
import { lists$, type BookmarkList } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { showSnackbar, ui$ } from '@/states/ui'
import { getInactiveLists, getVisibleLists, isDeleted } from '@/lib/nori-data'
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { ManageRow, SectionLabel } from '@/components/common/Common'
import { Sheet } from '@/components/modal/BaseModal'
import { SortableList } from '@/components/common/SortableList'
import { NouMenu } from '@/components/menu/NouMenu'

export const ManageListsSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const colorScheme = useAppColorScheme()
  const isDark = colorScheme === 'dark'
  const lists = useValue(lists$.lists)
  const visible = useValue(ui$.listManagerOpen)
  const visibleLists = getVisibleLists(lists)
  const inactiveLists = getInactiveLists(lists)
  const scrollOffset = useSharedValue(0)
  const scrollRef = useRef(null)

  const handleScroll = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y
  }

  const toggleList = (list: BookmarkList, visible: boolean) => {
    lists$.setVisible(list.id, visible)
    if (visible) {
      settings$.setLastSelectedListId(list.id)
    }
  }

  const deleteList = (list: BookmarkList) => {
    const bookmarkSnapshots = bookmarks$.bookmarks.get().filter(
      (item) => item.listId === list.id && !isDeleted(item),
    )
    if (!lists$.deleteList(list.id)) {
      return
    }
    bookmarks$.deleteByListId(list.id)
    showSnackbar(t('lists.deleted'), t('common.undo'), () => {
      lists$.restoreList(list)
      bookmarks$.restoreMany(bookmarkSnapshots)
    })
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
      height={windowHeight * 0.85}
      contentScrollRef={scrollRef}
      contentScrollOffset={scrollOffset}
      edgeToEdgeBottom
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
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-8"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
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
      </ScrollView>
    </Sheet>
  )
}
