import { useRef, useState } from 'react'
import { Pressable, View, type GestureResponderEvent } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { settings$ } from '@/states/settings'
import {
  FONT_FAMILIES,
  FONT_SCALE_STEP,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  normalizeFontFamily,
  normalizeFontScale,
} from '@/lib/typography'
import { NoriText } from '@/components/common/NoriText'
import { SegmentedOption } from '@/components/common/Common'

export function TypographyRow() {
  const { t } = useTranslation()
  const familyLabels = { system: 'fontSystem', serif: 'fontSerif', monospace: 'fontMonospace' }
  const scale = normalizeFontScale(useValue(settings$.fontScale))
  const family = normalizeFontFamily(useValue(settings$.fontFamily))
  const [width, setWidth] = useState(0)
  const track = useRef<View>(null)
  const setScale = (value: number) => settings$.fontScale.set(normalizeFontScale(value))
  const adjust = (direction: number) => setScale(scale + direction * FONT_SCALE_STEP)
  const pick = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX
    track.current?.measure((_x, _y, measuredWidth, _height, originX) => {
      if (measuredWidth <= 0) return
      const fraction = Math.max(0, Math.min(1, (pageX - originX - 12) / Math.max(1, measuredWidth - 24)))
      setScale(
        Math.round((MIN_FONT_SCALE + fraction * (MAX_FONT_SCALE - MIN_FONT_SCALE)) / FONT_SCALE_STEP) * FONT_SCALE_STEP,
      )
    })
  }
  const fraction = (scale - MIN_FONT_SCALE) / (MAX_FONT_SCALE - MIN_FONT_SCALE)

  return (
    <View className="gap-3 border-b-2 border-well px-4 py-4">
      <View className="flex-row items-center justify-between gap-2">
        <NoriText className="font-medium text-content">{t('settings.experience.fontSize')}</NoriText>
        <NoriText className="text-sm text-content-muted">{Math.round(scale * 100)}%</NoriText>
      </View>
      <View className="flex-row items-center gap-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.experience.fontDecrease')}
          disabled={scale <= MIN_FONT_SCALE}
          onPress={() => adjust(-1)}
          className={`h-11 w-11 items-center justify-center rounded-full border border-line bg-well ${scale <= MIN_FONT_SCALE ? 'opacity-40' : ''}`}
        >
          <NoriText className="text-content">A−</NoriText>
        </Pressable>
        <View
          ref={track}
          collapsable={false}
          accessibilityRole="adjustable"
          accessibilityLabel={t('settings.experience.fontSize')}
          accessibilityValue={{
            min: MIN_FONT_SCALE * 100,
            max: MAX_FONT_SCALE * 100,
            now: Math.round(scale * 100),
            text: `${Math.round(scale * 100)}%`,
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => adjust(nativeEvent.actionName === 'increment' ? 1 : -1)}
          onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={pick}
          onResponderMove={pick}
          className="h-11 flex-1 justify-center"
        >
          <View pointerEvents="none" className="h-1 rounded-full bg-muted">
            <View className="h-1 rounded-full bg-accent-fill" style={{ width: `${fraction * 100}%` }} />
          </View>
          <View
            pointerEvents="none"
            className="absolute h-6 w-6 rounded-full border-2 border-surface bg-accent-fill"
            style={{ left: fraction * Math.max(0, width - 24) }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.experience.fontIncrease')}
          disabled={scale >= MAX_FONT_SCALE}
          onPress={() => adjust(1)}
          className={`h-11 w-11 items-center justify-center rounded-full border border-line bg-well ${scale >= MAX_FONT_SCALE ? 'opacity-40' : ''}`}
        >
          <NoriText className="text-content">A+</NoriText>
        </Pressable>
      </View>
      <NoriText className="font-medium text-content">{t('settings.experience.fontFamily')}</NoriText>
      <View className="flex-row flex-wrap gap-2">
        {FONT_FAMILIES.map((value) => (
          <SegmentedOption
            key={value}
            label={t(`settings.experience.${familyLabels[value]}`)}
            active={family === value}
            onPress={() => settings$.fontFamily.set(value)}
          />
        ))}
      </View>
      <NoriText className="rounded-2xl bg-well p-3 text-base leading-6 text-content">
        {t('settings.experience.fontPreview')}
      </NoriText>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          settings$.fontScale.set(1)
          settings$.fontFamily.set('system')
        }}
      >
        <NoriText className="text-sm text-accent-700 dark:text-accent-300">
          {t('settings.experience.fontReset')}
        </NoriText>
      </Pressable>
    </View>
  )
}
