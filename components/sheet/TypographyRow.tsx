import { Platform, Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useThemeColors } from '@/lib/theme'
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
  const { t, i18n } = useTranslation()
  const isRTL = i18n.dir() === 'rtl'
  const themeColors = useThemeColors()
  const familyLabels = { system: 'fontSystem', serif: 'fontSerif', monospace: 'fontMonospace' }
  const scale = normalizeFontScale(useValue(settings$.fontScale))
  const family = normalizeFontFamily(useValue(settings$.fontFamily))
  const adjust = (direction: number) => settings$.fontScale.set(normalizeFontScale(scale + direction * FONT_SCALE_STEP))

  return (
    <View className="gap-3 border-b-2 border-well px-4 py-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <NoriText className="font-medium text-content">{t('settings.experience.fontSize')}</NoriText>
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.experience.fontDecrease')}
            disabled={scale <= MIN_FONT_SCALE}
            onPress={() => adjust(-1)}
            className={`h-11 w-11 items-center justify-center rounded-full active:bg-muted ${scale <= MIN_FONT_SCALE ? 'opacity-40' : ''}`}
          >
            <MaterialIcons name="remove" size={20} color={themeColors.contentMuted} />
          </Pressable>
          <NoriText
            accessible
            accessibilityRole={Platform.OS === 'web' ? 'spinbutton' : 'adjustable'}
            accessibilityLabel={t('settings.experience.fontSize')}
            accessibilityValue={{
              min: MIN_FONT_SCALE * 100,
              max: MAX_FONT_SCALE * 100,
              now: Math.round(scale * 100),
              text: `${Math.round(scale * 100)}%`,
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') adjust(1)
              if (nativeEvent.actionName === 'decrement') adjust(-1)
            }}
            aria-valuemin={MIN_FONT_SCALE * 100}
            aria-valuemax={MAX_FONT_SCALE * 100}
            aria-valuenow={Math.round(scale * 100)}
            aria-valuetext={`${Math.round(scale * 100)}%`}
            {...(Platform.OS === 'web'
              ? {
                  tabIndex: 0 as const,
                  onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      adjust(event.key === 'ArrowUp' ? 1 : -1)
                    }
                  },
                }
              : {})}
            className="min-w-[64px] text-center font-semibold text-content-secondary"
          >
            {Math.round(scale * 100)}%
          </NoriText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.experience.fontIncrease')}
            disabled={scale >= MAX_FONT_SCALE}
            onPress={() => adjust(1)}
            className={`h-11 w-11 items-center justify-center rounded-full active:bg-muted ${scale >= MAX_FONT_SCALE ? 'opacity-40' : ''}`}
          >
            <MaterialIcons name="add" size={20} color={themeColors.contentMuted} />
          </Pressable>
        </View>
      </View>
      <NoriText className="font-medium text-content">{t('settings.experience.fontFamily')}</NoriText>
      <View className="flex-row flex-wrap justify-end gap-2">
        {FONT_FAMILIES.map((value) => (
          <SegmentedOption
            key={value}
            label={t(`settings.experience.${familyLabels[value]}`)}
            active={family === value}
            onPress={() => settings$.fontFamily.set(value)}
          />
        ))}
      </View>
      <NoriText
        className="max-w-full self-end rounded-2xl bg-well p-3 text-base leading-6 text-content"
        style={{ textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }}
      >
        {t('settings.experience.fontPreview')}
      </NoriText>
      <Pressable
        accessibilityRole="button"
        className="max-w-full self-end"
        onPress={() => {
          settings$.fontScale.set(1)
          settings$.fontFamily.set('system')
        }}
      >
        <NoriText
          className="text-sm text-accent-700 dark:text-accent-300"
          style={{ textAlign: isRTL ? 'left' : 'right' }}
        >
          {t('settings.experience.fontReset')}
        </NoriText>
      </Pressable>
    </View>
  )
}
