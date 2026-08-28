import { Platform, Pressable, View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useAppColorScheme } from '@/lib/theme'
import { noriTextStyle } from '@/components/common/NoriText'

export interface ListChipProps {
  name: string
  isActive?: boolean
  onPress: () => void
  // Pager-specific props
  pagerScrollX?: SharedValue<number>
  index?: number
  pageWidth?: number
}

export const ListChip: React.FC<ListChipProps> = ({
  name,
  isActive,
  onPress,
  pagerScrollX,
  index = 0,
  pageWidth = 0,
}) => {
  const colorScheme = useAppColorScheme()
  const isDark = colorScheme === 'dark'
  const animatedPagerScrollX = Platform.OS === 'web' ? undefined : pagerScrollX

  // Colors matching original: bg-stone-900 / dark:bg-stone-100 (active), border-stone-200 / dark:border-stone-800 (inactive)
  const activeBg = isDark ? '#f5f5f4' : '#1c1917'
  const inactiveBorder = isDark ? '#292524' : '#e7e5e4'
  const activeText = isDark ? '#0c0a09' : '#fafaf9'
  const inactiveText = isDark ? '#a8a29e' : '#57534e'

  // Drive the active indicator directly from scroll position if pagerScrollX is provided
  const activeStyle = useAnimatedStyle(() => {
    'worklet'
    if (!animatedPagerScrollX || pageWidth === 0) {
      return {
        opacity: isActive ? 1 : 0,
        position: 'absolute',
        inset: 0,
        borderRadius: 9999,
      }
    }
    const progress = interpolate(
      animatedPagerScrollX.value,
      [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth],
      [0, 1, 0],
      'clamp',
    )
    return {
      opacity: progress > 0.5 ? 1 : 0,
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
    }
  }, [isActive, animatedPagerScrollX, pageWidth, index])

  const inactiveStyle = useAnimatedStyle(() => {
    'worklet'
    if (!animatedPagerScrollX || pageWidth === 0) {
      return {
        opacity: isActive ? 0 : 1,
        position: 'absolute',
        inset: 0,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: inactiveBorder,
      }
    }
    const progress = interpolate(
      animatedPagerScrollX.value,
      [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth],
      [0, 1, 0],
      'clamp',
    )
    return {
      opacity: progress > 0.5 ? 0 : 1,
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: inactiveBorder,
    }
  }, [isActive, animatedPagerScrollX, pageWidth, index, inactiveBorder])

  const textStyle = useAnimatedStyle(() => {
    'worklet'
    if (!animatedPagerScrollX || pageWidth === 0) {
      return { color: isActive ? activeText : inactiveText }
    }
    const progress = interpolate(
      animatedPagerScrollX.value,
      [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth],
      [0, 1, 0],
      'clamp',
    )
    return { color: progress > 0.5 ? activeText : inactiveText }
  }, [isActive, animatedPagerScrollX, pageWidth, index, activeText, inactiveText])

  return (
    <View className="items-center gap-2">
      <Pressable
        onPress={onPress}
        testID={`list_chip_${name}`}
        accessibilityLabel={name}
        accessibilityRole="tab"
        className="relative h-[32px] items-center justify-center overflow-hidden rounded-full px-4"
      >
        <Animated.View style={[activeStyle, { backgroundColor: activeBg }]} />
        <Animated.View style={inactiveStyle} />
        <Animated.Text className="relative text-sm font-medium" style={[noriTextStyle, textStyle]}>
          {name}
        </Animated.Text>
      </Pressable>
    </View>
  )
}
