import { useState, type ReactNode } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { SegmentedOption } from '@/components/common/Common'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { PreviewSettings } from '@/components/bookmark/PreviewSettings'
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { ACCENT_IDS, SYSTEM_ACCENT, accentColor, isCustomAccent, normalizeAccent } from '@/lib/accent'
import { isDynamicColorAvailable } from '@/lib/dynamic-palette'
import { AboutRow } from '@/components/sheet/SettingsSheetAbout'
import { TypographyRow } from '@/components/sheet/TypographyRow'
import { CustomAccentPanel, CustomAccentSwatch } from '@/components/sheet/CustomAccent'
import { languageNativeNames, supportedI18nLanguages } from '@/lib/language'
import { getVisibleLists } from '@/lib/nori-data'
import { canLoadPagesForTitles } from '@/lib/rendered-titles'

/**
 * The settings every shell shares: the Expo app, the browser extension and the
 * desktop app all render these sections, so a setting added here shows up in
 * all three. Keep this module free of native-only imports.
 */
export const SectionCard: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <View className="gap-3">
    <NoriText className="px-1 text-xs uppercase tracking-[0.18em] text-content-subtle">{title}</NoriText>
    <View className="overflow-hidden rounded-[24px] bg-surface">
      {children}
    </View>
  </View>
)

const quickSaveTargetListId = (listId: string, visibleLists: { id: string }[]) =>
  visibleLists.some((list) => list.id === listId) ? listId : ''

export const ExperienceSection: React.FC<{
  onOpenAppearance: () => void
  /** What "follow the system" resolves to; each shell reads it its own way. */
  systemLanguage: string
}> = ({ onOpenAppearance, systemLanguage }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const openInSystemBrowser = useValue(settings$.openInSystemBrowser)
  const loadPagesForTitles = useValue(settings$.loadPagesForTitles)
  const newBookmarksAtTop = useValue(settings$.newBookmarksAtTop)
  const quickSaveSharedLinks = useValue(settings$.quickSaveSharedLinks)
  const quickSaveShareListId = useValue(settings$.quickSaveShareListId)
  const selectedLanguage = useValue(settings$.language)
  const lists = useValue(lists$.lists)
  const visibleLists = getVisibleLists(lists)
  const quickShareTargetList = visibleLists.find((list) => list.id === quickSaveShareListId) || visibleLists[0]

  const toLanguageLabel = (code: string) => languageNativeNames[code as keyof typeof languageNativeNames] || code
  const currentLanguageLabel = selectedLanguage
    ? toLanguageLabel(selectedLanguage)
    : `${t('settings.experience.languageSystem')} (${toLanguageLabel(systemLanguage)})`

  const languageMenuItems: NouMenuItem[] = [
    {
      label: `${t('settings.experience.languageSystem')} (${toLanguageLabel(systemLanguage)})`,
      selected: selectedLanguage === null,
      handler: () => settings$.setLanguage(null),
    },
    ...supportedI18nLanguages.map((lang) => ({
      label: toLanguageLabel(lang),
      selected: selectedLanguage === lang,
      handler: () => settings$.setLanguage(lang),
    })),
  ]
  const quickShareListMenuItems: NouMenuItem[] = visibleLists.map((list) => ({
    label: list.name,
    selected: quickShareTargetList?.id === list.id,
    handler: () => settings$.setQuickSaveShareListId(list.id),
  }))
  const toggleQuickShare = () => {
    const nextEnabled = !quickSaveSharedLinks
    if (nextEnabled && !quickSaveTargetListId(quickSaveShareListId, visibleLists)) {
      settings$.setQuickSaveShareListId(visibleLists[0]?.id || '')
    }
    settings$.setQuickSaveSharedLinks(nextEnabled)
  }

  return (
    <SectionCard title={t('settings.experience.label')}>
      <AboutRow
        icon="palette"
        title={t('settings.appearance.label')}
        detail={t('settings.appearance.hint')}
        onPress={onOpenAppearance}
        themeColors={themeColors}
      />
      {canLoadPagesForTitles() ? (
        <View className="border-b-2 border-well px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
              <MaterialIcons name="web" color={themeColors.contentMuted} size={18} />
            </View>
            <View className="flex-1">
              <NoriText className="font-medium text-content">{t('settings.experience.loadPagesForTitles')}</NoriText>
              <NoriText className="mt-1 text-sm leading-5 text-content-muted">{t('settings.experience.loadPagesForTitlesHint')}</NoriText>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t('settings.experience.loadPagesForTitles')}
              accessibilityState={{ checked: loadPagesForTitles }}
              onPress={() => settings$.setLoadPagesForTitles(!loadPagesForTitles)}
              className={`h-8 w-14 rounded-full p-1 ${loadPagesForTitles ? 'bg-accent-500' : 'bg-muted-strong'}`}
            >
              <View className={`h-6 w-6 rounded-full bg-white ${loadPagesForTitles ? 'ml-auto' : ''}`} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <View className="border-b-2 border-well px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
            <MaterialIcons name="vertical-align-top" color={themeColors.contentMuted} size={18} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">{t('settings.experience.newAtTop')}</NoriText>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t('settings.experience.newAtTop')}
            accessibilityState={{ checked: newBookmarksAtTop }}
            onPress={() => settings$.setNewBookmarksAtTop(!newBookmarksAtTop)}
            className={`h-8 w-14 rounded-full p-1 ${newBookmarksAtTop ? 'bg-accent-500' : 'bg-muted-strong'}`}
          >
            <View className={`h-6 w-6 rounded-full bg-white ${newBookmarksAtTop ? 'ml-auto' : ''}`} />
          </Pressable>
        </View>
      </View>
      {/* Opening links and receiving shares are the browser's or the OS's job on the web shells. */}
      {Platform.OS !== 'web' ? (
        <>
          <View className="border-b-2 border-well px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
                <MaterialIcons name="open-in-browser" color={themeColors.contentMuted} size={18} />
              </View>
              <View className="flex-1">
                <NoriText className="font-medium text-content">
                  {t('settings.experience.defaultBrowser')}
                </NoriText>
                <NoriText className="mt-1 text-sm leading-5 text-content-muted">
                  {t('settings.experience.defaultBrowserHint')}
                </NoriText>
              </View>
              <Pressable
                onPress={() => settings$.setOpenInSystemBrowser(!openInSystemBrowser)}
                className={`h-8 w-14 rounded-full p-1 ${openInSystemBrowser ? 'bg-accent-500' : 'bg-muted-strong'}`}
              >
                <View className={`h-6 w-6 rounded-full bg-white ${openInSystemBrowser ? 'ml-auto' : ''}`} />
              </Pressable>
            </View>
          </View>
          <View className="border-b-2 border-well px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
                <MaterialIcons name="save-alt" color={themeColors.contentMuted} size={18} />
              </View>
              <View className="flex-1">
                <NoriText className="font-medium text-content">
                  {t('settings.experience.quickShare')}
                </NoriText>
                <NoriText className="mt-1 text-sm leading-5 text-content-muted">
                  {t('settings.experience.quickShareHint')}
                </NoriText>
              </View>
              <Pressable
                onPress={toggleQuickShare}
                disabled={visibleLists.length === 0}
                className={`h-8 w-14 rounded-full p-1 ${quickSaveSharedLinks ? 'bg-accent-500' : 'bg-muted-strong'} disabled:opacity-50`}
              >
                <View className={`h-6 w-6 rounded-full bg-white ${quickSaveSharedLinks ? 'ml-auto' : ''}`} />
              </Pressable>
            </View>
            {quickSaveSharedLinks ? (
              <View className="mt-3 flex-row justify-end">
                <NouMenu
                  trigger={
                    <View className="flex-row items-center gap-1 rounded-full border border-line-strong bg-well px-3 py-1.5">
                      <NoriText className="text-sm font-medium text-content-secondary">
                        {quickShareTargetList?.name || t('lists.unknown')}
                      </NoriText>
                      <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.contentMuted} />
                    </View>
                  }
                  items={quickShareListMenuItems}
                />
              </View>
            ) : null}
          </View>
        </>
      ) : null}
      <View className="border-b-2 border-well px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
            <MaterialIcons name="translate" color={themeColors.contentMuted} size={18} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">{t('settings.experience.language')}</NoriText>
            <NoriText className="mt-1 text-sm leading-5 text-content-muted">
              {t('settings.experience.languageHint')}
            </NoriText>
          </View>
          <NouMenu
            trigger={
              <View className="flex-row items-center gap-1 rounded-full border border-line-strong bg-well px-3 py-1.5">
                <NoriText className="text-sm font-medium text-content-secondary">{currentLanguageLabel}</NoriText>
                <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.contentMuted} />
              </View>
            }
            items={languageMenuItems}
          />
        </View>
      </View>
    </SectionCard>
  )
}

export const AppearanceSection: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const theme = useValue(settings$.theme)
  const showFavicon = useValue(settings$.showFavicon)
  const bookmarkColumns = useValue(settings$.bookmarkColumns) === 1 ? 1 : 2
  const preview = useValue(settings$.bookmarkView) === 'preview'
  return (
    <View className="overflow-hidden rounded-[24px] bg-surface">
      <View className="border-b-2 border-well px-4 py-4">
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
            <MaterialIcons name="palette" color={themeColors.contentMuted} size={18} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">{t('settings.experience.theme')}</NoriText>
            <NoriText className="mt-1 text-sm leading-5 text-content-muted">
              {t('settings.experience.themeHint')}
            </NoriText>
          </View>
        </View>
        <View className="flex-row flex-wrap justify-end gap-2">
          <SegmentedOption
            label={t('settings.experience.system')}
            active={theme === null}
            onPress={() => settings$.theme.set(null)}
          />
          <SegmentedOption
            label={t('settings.experience.light')}
            active={theme === 'light'}
            onPress={() => settings$.theme.set('light')}
          />
          <SegmentedOption
            label={t('settings.experience.dark')}
            active={theme === 'dark'}
            onPress={() => settings$.theme.set('dark')}
          />
          <SegmentedOption
            label={t('settings.experience.amoled')}
            active={theme === 'amoled'}
            onPress={() => settings$.theme.set('amoled')}
          />
        </View>
      </View>
      <AccentRow />
      <PreviewSettings />
      {Platform.OS !== 'web' && !preview ? (
        <View className="border-b-2 border-well px-4 py-4">
          <View className="mb-3 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
              <MaterialIcons name="view-agenda" color={themeColors.contentMuted} size={18} />
            </View>
            <NoriText className="flex-1 font-medium text-content">{t('settings.experience.bookmarkLayout')}</NoriText>
          </View>
          <View className="flex-row flex-wrap justify-end gap-2">
            {([1, 2] as const).map((columns) => (
              <Pressable
                key={columns}
                accessibilityRole="radio"
                accessibilityState={{ selected: bookmarkColumns === columns }}
                onPress={() => settings$.setBookmarkColumns(columns)}
                className={`rounded-full px-4 py-2 ${bookmarkColumns === columns ? 'bg-accent-fill' : 'bg-muted'}`}
              >
                <NoriText className={`text-sm font-medium ${bookmarkColumns === columns ? 'text-accent-on' : 'text-content-secondary'}`}>
                  {t(`settings.experience.${columns === 1 ? 'oneColumn' : 'twoColumns'}`)}
                </NoriText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <TypographyRow />
      <View className="px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
            <MaterialIcons name="image" color={themeColors.contentMuted} size={18} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">
              {t('settings.experience.showFavicon')}
            </NoriText>
            <NoriText className="mt-1 text-sm leading-5 text-content-muted">
              {t('settings.experience.showFaviconHint')}
            </NoriText>
          </View>
          <Pressable
            onPress={() => settings$.setShowFavicon(showFavicon === false)}
            className={`h-8 w-14 rounded-full p-1 ${showFavicon !== false ? 'bg-accent-500' : 'bg-muted-strong'}`}
          >
            <View className={`h-6 w-6 rounded-full bg-white ${showFavicon !== false ? 'ml-auto' : ''}`} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

/**
 * Repaints the accent by writing the --nori-accent-* variables; see
 * lib/accent.ts. The swatches show the step the UI actually uses for solid
 * accent fills, so what you pick is what you get.
 */
const AccentRow: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const isDark = useAppColorScheme() === 'dark'
  const accent = normalizeAccent(useValue(settings$.accent))
  const custom = isCustomAccent(accent)
  const system = accent === SYSTEM_ACCENT
  // Opens showing the picker when a custom accent is already in use, so the
  // strips are where the current colour came from rather than a hidden state.
  const [pickerOpen, setPickerOpen] = useState(custom)

  return (
    <View className="border-b-2 border-well px-4 py-4">
      <View className="mb-3 flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-well">
          <MaterialIcons name="color-lens" color={themeColors.contentMuted} size={18} />
        </View>
        <View className="flex-1">
          <NoriText className="font-medium text-content">{t('settings.experience.accent')}</NoriText>
          <NoriText className="mt-1 text-sm leading-5 text-content-muted">
            {t('settings.experience.accentHint')}
          </NoriText>
        </View>
      </View>
      {isDynamicColorAvailable ? (
        <Pressable
          onPress={() => settings$.setAccent(SYSTEM_ACCENT)}
          accessibilityRole="radio"
          accessibilityState={{ selected: system }}
          className={`mb-3 flex-row items-center gap-3 rounded-2xl border-2 px-3 py-2.5 active:opacity-70 ${
            system ? 'border-content' : 'border-line'
          }`}
        >
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: accentColor(SYSTEM_ACCENT, isDark ? 400 : 600) }}
          >
            <MaterialIcons name="wallpaper" size={16} color={themeColors.contentInverse} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">{t('settings.experience.accentSystem')}</NoriText>
            <NoriText className="text-sm leading-5 text-content-muted">
              {t('settings.experience.accentSystemHint')}
            </NoriText>
          </View>
          {system ? <MaterialIcons name="check" size={20} color={themeColors.content} /> : null}
        </Pressable>
      ) : null}
      <View className="flex-row flex-wrap justify-end gap-1.5">
        {ACCENT_IDS.map((id) => {
          const selected = id === accent
          return (
            <Pressable
              key={id}
              onPress={() => settings$.setAccent(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={id}
              className={`h-9 w-9 items-center justify-center rounded-full border-2 active:opacity-70 ${
                selected ? 'border-content' : 'border-transparent'
              }`}
            >
              <View
                className="h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: accentColor(id, isDark ? 400 : 600) }}
              >
                {selected ? <MaterialIcons name="check" size={14} color={themeColors.contentInverse} /> : null}
              </View>
            </Pressable>
          )
        })}
        <CustomAccentSwatch accent={accent} isDark={isDark} open={pickerOpen} onToggle={() => setPickerOpen((open) => !open)} />
      </View>
      <CustomAccentPanel accent={accent} open={pickerOpen} />
    </View>
  )
}
