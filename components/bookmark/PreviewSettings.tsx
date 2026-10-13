import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useTranslation } from 'react-i18next'
import { settings$ } from '@/states/settings'
import { useThemeColors } from '@/lib/theme'
import { NoriText } from '@/components/common/NoriText'

export function PreviewSettings() {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const mode = useValue(settings$.bookmarkView)
  const source = useValue(settings$.previewImageSource)
  return (
    <>
      <View className="border-b-2 border-well px-4 py-4">
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
            <MaterialIcons name="art-track" color={themeColors.contentMuted} size={18} />
          </View>
          <NoriText className="flex-1 font-medium text-content">{t('preview.view')}</NoriText>
        </View>
        <View className="flex-row flex-wrap justify-end gap-2">
          {(['compact', 'preview'] as const).map((value) => (
            <Choice
              key={value}
              label={t(`preview.${value}`)}
              active={mode === value}
              onPress={() => settings$.bookmarkView.set(value)}
            />
          ))}
        </View>
      </View>
      {mode === 'preview' ? (
        <View className="border-b-2 border-well px-4 py-4">
          <View className="mb-3 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
              <MaterialIcons name="image" color={themeColors.contentMuted} size={18} />
            </View>
            <View className="flex-1">
              <NoriText className="font-medium text-content">{t('preview.imageSource')}</NoriText>
              <NoriText className="mt-1 text-sm leading-5 text-content-muted">
                {t('preview.imageSourceHint')}
              </NoriText>
            </View>
          </View>
          <View className="flex-row flex-wrap justify-end gap-2">
            {(['page-image', 'screenshot'] as const).map((value) => (
              <Choice
                key={value}
                label={t(`preview.${value}`)}
                active={source === value}
                onPress={() => settings$.previewImageSource.set(value)}
              />
            ))}
          </View>
          <NoriText className="mt-3 text-xs text-content-muted">{t('preview.cacheHint')}</NoriText>
        </View>
      ) : null}
    </>
  )
}
export function Choice({
  label,
  active,
  onPress,
  tinted,
}: {
  label: string
  active: boolean
  onPress: () => void
  // Tint instead of fill, for dialogs where a solid accent button is the primary action.
  tinted?: boolean
}) {
  const themeColors = useThemeColors()
  const className = tinted
    ? `rounded-full border px-4 py-2 ${
        active ? 'border-accent-500 bg-accent-100/70 dark:bg-accent-950/30' : 'border-transparent bg-muted'
      }`
    : `rounded-full px-4 py-2 ${active ? 'bg-accent-fill' : 'bg-muted'}`
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress} className={className}>
      <NoriText
        className={`text-sm ${active && !tinted ? 'text-accent-on' : 'text-content-secondary'}`}
        style={active && tinted ? { color: themeColors.accent } : undefined}
      >
        {label}
      </NoriText>
    </Pressable>
  )
}
