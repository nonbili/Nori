import { Platform, Pressable, View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated'
import { useThemeColors } from '@/lib/theme'
import { useTypographyStyle } from '@/components/common/NoriText'

export interface ListChipProps {
  name: string
  isActive?: boolean
  onPress: () => void
  // Pager-specific props
  pagerScrollX?: SharedValue<number>
  // False until the pager has scrolled to the selected list
  pagerSynced?: SharedValue<boolean>
  index?: number
  pageWidth?: number
}

export const ListChip: React.FC<ListChipProps> = ({
  name,
  isActive,
  onPress,
  pagerScrollX,
  pagerSynced,
  index = 0,
  pageWidth = 0,
}) => {
  const themeColors = useThemeColors()
  const typography = useTypographyStyle({ fontSize: 14, lineHeight: 20 })
  const animatedPagerScrollX = Platform.OS === 'web' ? undefined : pagerScrollX

  // The active pill is driven by a worklet, so these are the token equivalents
  // of bg-accent-fill / bg-surface / text-accent-on / text-content-muted. The chip
  // row is the only always-visible chrome, so it is what makes the accent
  // setting show up on the home screen.
  const activeBg = themeColors.accentFill
  const inactiveBg = themeColors.surface
  const activeText = themeColors.onAccent
  const inactiveText = themeColors.contentMuted

  // Drive the active indicator directly from scroll position if pagerScrollX is
  // provided. Until the pager has snapped to the selected list, pagerScrollX is
  // still 0, so fall back to isActive: Reanimated keeps the style computed at
  // mount as the view's React props, and a stale "first chip active" there can
  // resurface on a later re-render (cold start showing SNS and Later both lit).
  const active = useDerivedValue(() => {
    if (!animatedPagerScrollX || pageWidth === 0 || !pagerSynced?.value) {
      return !!isActive
    }
    const progress = interpolate(
      animatedPagerScrollX.value,
      [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth],
      [0, 1, 0],
      'clamp',
    )
    return progress > 0.5
  }, [isActive, animatedPagerScrollX, pagerSynced, pageWidth, index])

  const activeStyle = useAnimatedStyle(() => {
    'worklet'
    return {
      opacity: active.value ? 1 : 0,
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
    }
  }, [active])

  const inactiveStyle = useAnimatedStyle(() => {
    'worklet'
    return {
      opacity: active.value ? 0 : 1,
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backgroundColor: inactiveBg,
    }
  }, [active, inactiveBg])

  const textStyle = useAnimatedStyle(() => {
    'worklet'
    return { color: active.value ? activeText : inactiveText }
  }, [active, activeText, inactiveText])

  return (
    <View className="items-center gap-2">
      <Pressable
        onPress={onPress}
        testID={`list_chip_${name}`}
        accessibilityLabel={name}
        accessibilityRole="tab"
        className="relative min-h-[36px] py-2 items-center justify-center overflow-hidden rounded-full px-4"
      >
        <Animated.View style={[activeStyle, { backgroundColor: activeBg }]} />
        <Animated.View style={inactiveStyle} />
        <Animated.Text className="relative text-sm font-medium" style={[typography, textStyle]}>
          {name}
        </Animated.Text>
      </Pressable>
    </View>
  )
}
