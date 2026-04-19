import { type ReactNode } from 'react'
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'

import { GestureHandlerRootView } from 'react-native-gesture-handler'

export const FullScreenModal: React.FC<{
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
  showCloseButton?: boolean
}> = ({ visible, title, onClose, children, showCloseButton = true }) => {
  const insets = useSafeAreaInsets()
  const themeColors = useThemeColors()
  const showHeader = !!title || showCloseButton

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          className="flex-1 bg-stone-50 px-6 dark:bg-stone-950"
          style={{ paddingTop: Math.max(insets.top, 16) }}
        >
          {showHeader ? (
            <View className="mb-6 flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-stone-900 dark:text-stone-50">{title}</Text>
              {showCloseButton ? (
                <Pressable
                  onPress={onClose}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  className="rounded-full bg-stone-200 p-2 active:bg-stone-300 dark:bg-stone-900 dark:active:bg-stone-800"
                >
                  <MaterialIcons name="close" color={themeColors.iconMuted} size={20} />
                </Pressable>
              ) : (
                <View className="h-10 w-10" />
              )}
            </View>
          ) : null}
          <View className="flex-1" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            {children}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

export const Sheet: React.FC<{
  visible: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  headerLeft?: ReactNode
  headerRight?: ReactNode
  showCloseButton?: boolean
  height?: number
}> = ({ visible, title, onClose, children, headerLeft, headerRight, showCloseButton = true, height }) => {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const themeColors = useThemeColors()
  const showHeader = !!title || !!headerLeft || !!headerRight || showCloseButton

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black/60">
          <Pressable className="flex-1" onPress={onClose} testID="sheet_backdrop" accessibilityLabel="Dismiss" />
          <View
            className="rounded-t-[32px] border-t border-stone-200 bg-stone-50 px-6 pb-6 dark:border-stone-800 dark:bg-stone-950"
            accessibilityViewIsModal={true}
            style={{
              paddingBottom: Math.max(insets.bottom + 16, 24),
              height,
              maxHeight: windowHeight * 0.9,
            }}
          >
            <View className="items-center py-4">
              <View className="h-1.5 w-12 rounded-full bg-stone-200 dark:bg-stone-800" />
            </View>
            {showHeader ? (
              <View className="mb-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  {title ? <Text className="text-xl font-semibold text-stone-900 dark:text-stone-50">{title}</Text> : null}
                  {headerLeft}
                </View>
                <View className="flex-row items-center gap-2">
                  {headerRight}
                  {showCloseButton ? (
                    <Pressable
                      onPress={onClose}
                      accessibilityLabel="Close"
                      accessibilityRole="button"
                      className="rounded-full bg-stone-200 p-2 active:bg-stone-300 dark:bg-stone-900 dark:active:bg-stone-800"
                    >
                      <MaterialIcons name="close" color={themeColors.iconMuted} size={20} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
            {children}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
