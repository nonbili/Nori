import { useValue } from '@legendapp/state/react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { settings$ } from '@/states/settings'
import { NoriText } from '@/components/common/NoriText'

export function PreviewSettings() {
  const { t } = useTranslation()
  const mode = useValue(settings$.bookmarkView)
  const source = useValue(settings$.previewImageSource)
  return (
    <View className="gap-3 border-b-2 border-well px-4 py-4">
      <NoriText className="font-medium text-content">{t('preview.view')}</NoriText>
      <View className="flex-row flex-wrap gap-2">
        {(['compact', 'preview'] as const).map((value) => (
          <Choice
            key={value}
            label={t(`preview.${value}`)}
            active={mode === value}
            onPress={() => settings$.bookmarkView.set(value)}
          />
        ))}
      </View>
      {mode === 'preview' ? (
        <>
          <NoriText className="font-medium text-content">{t('preview.imageSource')}</NoriText>
          <View className="flex-row flex-wrap gap-2">
            {(['page-image', 'screenshot'] as const).map((value) => (
              <Choice
                key={value}
                label={t(`preview.${value}`)}
                active={source === value}
                onPress={() => settings$.previewImageSource.set(value)}
              />
            ))}
          </View>
          <NoriText className="text-xs text-content-muted">{t('preview.cacheHint')}</NoriText>
        </>
      ) : null}
    </View>
  )
}
export function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${active ? 'bg-accent-fill' : 'bg-muted'}`}
    >
      <NoriText className={`text-sm ${active ? 'text-accent-on' : 'text-content-secondary'}`}>{label}</NoriText>
    </Pressable>
  )
}
