import { Pressable, useWindowDimensions } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useEffect, useRef, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { ui$ } from '@/states/ui'
import { useThemeColors } from '@/lib/theme'
import { Sheet } from '@/components/modal/BaseModal'
import {
  ExperienceSection,
  SyncSettingsSections,
  TransferSection,
} from '@/components/sheet/SettingsSheetSections'
import { AboutSettingsSection, SettingsAboutPage } from '@/components/sheet/SettingsSheetAbout'
import { useSettingsSheetActions } from '@/components/sheet/useSettingsSheetActions'
import { version as appVersion } from '@/package.json'

export const SettingsSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const { height: windowHeight } = useWindowDimensions()
  const visible = useValue(ui$.settingsSheetOpen)
  const scrollOffset = useSharedValue(0)
  const scrollRef = useRef(null)
  const [page, setPage] = useState<'home' | 'about'>('home')
  const settingsActions = useSettingsSheetActions()

  useEffect(() => {
    scrollOffset.value = 0
  }, [page, scrollOffset])

  const handleScroll = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y
  }

  const onClose = () => {
    ui$.settingsSheetOpen.set(false)
    setPage('home')
    scrollOffset.value = 0
  }

  const actions = {
    ...settingsActions,
    onOpenAbout: () => setPage('about'),
  }

  const headerLeft =
    page === 'home' ? undefined : (
      <Pressable
        onPress={() => setPage('home')}
        accessibilityLabel={t('common.back')}
        accessibilityRole="button"
        className="rounded-full bg-stone-200 p-2 active:bg-stone-300 dark:bg-stone-900 dark:active:bg-stone-800"
      >
        <MaterialIcons name="arrow-back" color={themeColors.iconMuted} size={20} />
      </Pressable>
    )

  return (
    <Sheet
      visible={visible}
      title={page === 'about' ? t('settings.about.label') : t('settings.title')}
      height={windowHeight * 0.85}
      onClose={page === 'about' ? () => setPage('home') : onClose}
      headerLeft={headerLeft}
      showCloseButton={page === 'home'}
      contentScrollRef={scrollRef}
      contentScrollOffset={scrollOffset}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName={`${page === 'about' ? 'gap-6' : 'gap-8'} pb-4`}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {page === 'about' ? (
          <SettingsAboutPage appVersion={appVersion} />
        ) : (
          <>
            <SyncSettingsSections actions={actions} />
            <ExperienceSection />
            <TransferSection actions={actions} />
            <AboutSettingsSection appVersion={appVersion} actions={actions} />
          </>
        )}
      </ScrollView>
    </Sheet>
  )
}
