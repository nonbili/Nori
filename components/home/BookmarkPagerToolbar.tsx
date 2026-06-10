import { Pressable, Text, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bookmarks$, type BookmarkRecord } from '@/states/bookmarks'
import { ui$ } from '@/states/ui'
import type { BookmarkPagerActions } from '@/components/home/BookmarkPagerParts'

export const BookmarkPagerToolbar: React.FC<{
  selectedBookmark: BookmarkRecord | null
  actions: BookmarkPagerActions
}> = ({ selectedBookmark, actions }) => {
  const bookmarkEditMode = useValue(ui$.bookmarkEditMode)
  const insets = useSafeAreaInsets()
  const { themeColors } = actions
  const openDrawerGesture = Gesture.Pan()
    .enabled(!bookmarkEditMode)
    .activeOffsetY([-6, 10000])
    .failOffsetX([-80, 80])
    .runOnJS(true)
    .onStart(() => {
      ui$.openBookmarksDrawer()
    })

  return (
    <View className="absolute left-6 right-6 z-10" style={{ bottom: insets.bottom + 16 }}>
      <GestureDetector gesture={openDrawerGesture}>
        <View
          className="flex-row items-center justify-between rounded-full border border-white/70 bg-white/70 px-3 py-2 shadow-lg dark:border-white/10 dark:bg-stone-950/70"
          style={{ shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 16 }}
        >
          {bookmarkEditMode ? (
            selectedBookmark ? (
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => {
                    bookmarks$.setVisible(selectedBookmark.id, false)
                    ui$.selectedBookmarkId.set(null)
                  }}
                  className="h-10 items-center justify-center rounded-full bg-stone-200 px-4 active:bg-stone-300 dark:bg-stone-800 dark:active:bg-stone-700"
                >
                  <Text className="text-sm font-medium text-stone-900 dark:text-stone-200">Hide</Text>
                </Pressable>
                <Pressable
                  onPress={actions.onRemoveSelectedBookmark}
                  className="h-10 w-10 items-center justify-center rounded-full bg-rose-100 active:bg-rose-200 dark:bg-rose-900/40 dark:active:bg-rose-900/60"
                >
                  <MaterialIcons name="delete" size={18} color={themeColors.iconDanger} />
                </Pressable>
              </View>
            ) : <View className="h-10 w-10" />
          ) : (
            <Pressable onPress={actions.onOpenNewBookmark} className="h-10 w-10 items-center justify-center rounded-full bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15">
              <MaterialIcons name="add" size={20} color={themeColors.iconMuted} />
            </Pressable>
          )}
          {!bookmarkEditMode ? (
            <Pressable onPress={() => ui$.openBookmarksDrawer()} className="h-10 items-center justify-center px-4">
              <View className="h-1 w-12 rounded-full bg-stone-300/90 dark:bg-white/20" />
              <MaterialIcons name="keyboard-arrow-up" size={24} color={themeColors.iconMuted} />
            </Pressable>
          ) : <View className="h-10 w-20" />}
          <Pressable
            onPress={() => {
              ui$.bookmarkEditMode.set(!bookmarkEditMode)
              ui$.selectedBookmarkId.set(null)
            }}
            className={`h-10 w-10 items-center justify-center rounded-full ${bookmarkEditMode ? 'bg-emerald-600 active:bg-emerald-700' : 'bg-white/80 active:bg-white dark:bg-white/10 dark:active:bg-white/15'}`}
          >
            <MaterialIcons name={bookmarkEditMode ? 'check' : 'edit'} size={18} color={bookmarkEditMode ? '#ffffff' : themeColors.iconMuted} />
          </Pressable>
        </View>
      </GestureDetector>
    </View>
  )
}
