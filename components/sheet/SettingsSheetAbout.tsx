import { Linking, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { useTranslation } from 'react-i18next'
import { useThemeColors, type ThemeColors } from '@/lib/theme'
import type { SettingsActions } from '@/components/sheet/SettingsSheetSections'
import { DONATE_LINKS, REPO_URL } from '@/lib/product-links'

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View className="gap-3">
    <NoriText className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{title}</NoriText>
    <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
      {children}
    </View>
  </View>
)

export const AboutRow: React.FC<{
  icon: MaterialIconsIconName
  title: string
  detail: string
  onPress?: () => void
  isLast?: boolean
  themeColors: ThemeColors
}> = ({ icon, title, detail, onPress, isLast = false, themeColors }) => {
  const content = (
    <View
      className={`flex-row items-center gap-3 px-4 py-4 ${isLast ? '' : 'border-b border-stone-200 dark:border-stone-800'}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
        <MaterialIcons name={icon} color={themeColors.iconMuted} size={18} />
      </View>
      <View className="flex-1">
        <NoriText className="font-medium text-stone-900 dark:text-stone-100">{title}</NoriText>
        <NoriText className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{detail}</NoriText>
      </View>
      {onPress ? <MaterialIcons name="chevron-right" color={themeColors.iconMuted} size={20} /> : null}
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      {content}
    </Pressable>
  )
}

export const SettingsAboutPage: React.FC<{ appVersion: string; actions: SettingsActions }> = ({
  appVersion,
  actions,
}) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()

  return (
    <>
      <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
        <AboutRow
          icon="info-outline"
          title={t('settings.about.version')}
          detail={`v${appVersion}`}
          themeColors={themeColors}
        />
        <AboutRow
          icon="history"
          title={t('settings.changelog.label')}
          detail={t('settings.changelog.hint')}
          onPress={actions.onOpenChangelog}
          themeColors={themeColors}
          isLast
        />
      </View>

      <SectionCard title={t('settings.about.code')}>
        <AboutRow
          icon="code"
          title="GitHub"
          detail="github.com/nonbili/Nori"
          onPress={() => void Linking.openURL(REPO_URL)}
          themeColors={themeColors}
          isLast
        />
      </SectionCard>

      <SectionCard title={t('settings.about.donate')}>
        {DONATE_LINKS.map((item, index) => (
          <AboutRow
            key={item.url}
            icon="favorite-outline"
            title={item.label}
            detail={item.detail}
            onPress={() => void Linking.openURL(item.url)}
            isLast={index === DONATE_LINKS.length - 1}
            themeColors={themeColors}
          />
        ))}
      </SectionCard>
    </>
  )
}

export const AboutSettingsSection: React.FC<{ appVersion: string; actions: SettingsActions }> = ({
  appVersion,
  actions,
}) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()

  return (
    <SectionCard title={t('settings.about.label')}>
      <AboutRow
        icon="info-outline"
        title={t('settings.about.label')}
        detail={`v${appVersion}`}
        onPress={actions.onOpenAbout}
        themeColors={themeColors}
        isLast
      />
    </SectionCard>
  )
}
