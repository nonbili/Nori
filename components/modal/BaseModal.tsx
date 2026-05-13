import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'

import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

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
  contentScrollRef?: any
  contentScrollOffset?: SharedValue<number>
}> = ({ visible, title, onClose, children, headerLeft, headerRight, showCloseButton = true, height, contentScrollRef, contentScrollOffset }) => {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const themeColors = useThemeColors()
  const showHeader = !!title || !!headerLeft || !!headerRight || showCloseButton
  const [rendered, setRendered] = useState(visible)

  const translateY = useSharedValue(0)
  const backdropOpacity = useSharedValue(0)

  const finishClose = useCallback(() => {
    setRendered(false)
    onClose()
  }, [onClose])

  const closeWithAnimation = useCallback(() => {
    translateY.value = withTiming(windowHeight, { duration: 220 }, (finished) => {
      if (finished) {
        runOnJS(finishClose)()
      }
    })
    backdropOpacity.value = withTiming(0, { duration: 180 })
  }, [backdropOpacity, finishClose, translateY, windowHeight])

  useEffect(() => {
    if (visible) {
      setRendered(true)
      translateY.value = windowHeight
      backdropOpacity.value = 0
      translateY.value = withTiming(0, { duration: 240 })
      backdropOpacity.value = withTiming(1, { duration: 180 })
    } else if (rendered) {
      closeWithAnimation()
    }
  }, [backdropOpacity, closeWithAnimation, rendered, translateY, visible, windowHeight])

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const dragGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      'worklet'
      if (event.translationY > 0) {
        translateY.value = event.translationY
      }
    })
    .onEnd((event) => {
      'worklet'
      if (event.translationY > 100 || event.velocityY > 500) {
        translateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
          if (finished) {
            runOnJS(finishClose)()
          }
        })
        backdropOpacity.value = withTiming(0, { duration: 160 })
      } else {
        translateY.value = withSpring(0, {
          damping: 18,
          stiffness: 120,
          overshootClamping: true,
        })
      }
    })

  const contentDragGesture = contentScrollOffset
    ? Gesture.Pan()
      .manualActivation(true)
      .simultaneousWithExternalGesture(contentScrollRef)
      .onTouchesMove((_event, manager) => {
        'worklet'
        if (contentScrollOffset.value <= 0) {
          manager.activate()
        } else {
          manager.fail()
        }
      })
      .onUpdate((event) => {
        'worklet'
        if (event.translationY > 0) {
          translateY.value = event.translationY
        }
      })
      .onEnd((event) => {
        'worklet'
        if (translateY.value > 0) {
          if (event.translationY > 100 || event.velocityY > 500) {
            translateY.value = withTiming(windowHeight, { duration: 180 }, (finished) => {
              if (finished) {
                runOnJS(finishClose)()
              }
            })
            backdropOpacity.value = withTiming(0, { duration: 160 })
          } else {
            translateY.value = withSpring(0, {
              damping: 18,
              stiffness: 120,
              overshootClamping: true,
            })
          }
        }
      })
    : null

  if (!rendered) {
    return null
  }

  return (
    <Modal visible={rendered} animationType="none" transparent onRequestClose={closeWithAnimation}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1">
          <Animated.View className="absolute inset-0 bg-black/60" style={backdropAnimatedStyle} />
          <Pressable className="flex-1" onPress={closeWithAnimation} testID="sheet_backdrop" accessibilityLabel="Dismiss" />
          <Animated.View
            className="rounded-t-[32px] border-t border-stone-200 bg-stone-50 px-6 pb-6 dark:border-stone-800 dark:bg-stone-950"
            accessibilityViewIsModal={true}
            style={[
              {
                paddingBottom: Math.max(insets.bottom + 16, 24),
                height,
                maxHeight: windowHeight * 0.9,
              },
              sheetAnimatedStyle,
            ]}
          >
            <GestureDetector gesture={dragGesture}>
              <View collapsable={false}>
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
                          onPress={closeWithAnimation}
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
              </View>
            </GestureDetector>
            {contentDragGesture ? <GestureDetector gesture={contentDragGesture}>{children}</GestureDetector> : children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
