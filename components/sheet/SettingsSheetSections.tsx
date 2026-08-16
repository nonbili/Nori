import type { ReactNode } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { SegmentedOption } from '@/components/common/Common'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { auth$ } from '@/states/auth'
import { lists$ } from '@/states/lists'
import { settings$ } from '@/states/settings'
import { syncMeta$ } from '@/states/sync-meta'
import { useThemeColors } from '@/lib/theme'
import { isIos } from '@/lib/utils'
import { signOut, startHostedSignIn } from '@/lib/supabase/auth'
import type { BookmarkTransferFormat } from '@/lib/bookmark-transfer'
import { AboutRow } from '@/components/sheet/SettingsSheetAbout'
import { useLocales } from 'expo-localization'
import { resolveI18nLanguageFromExpoLocale, supportedI18nLanguages } from '@/lib/i18n'
import { getVisibleLists } from '@/lib/nori-data'

const TERMS_OF_USE_URL = 'https://www.apple.com/legal/macapps/stdeula/'
const PRIVACY_POLICY_URL = 'https://inks.page/p/privacy'

export type SettingsBusyAction =
  | 'buy'
  | 'restore'
  | 'manage'
  | 'sync'
  | 'import'
  | 'export-html'
  | 'export-plain'
  | 'export-json'
  | null

export interface SettingsActions {
  actionError?: string
  busyAction: SettingsBusyAction
  loadingProduct: boolean
  productPrice?: string
  onPurchase: () => void
  onRestore: () => void
  onManage: () => void
  onManualSync: () => void
  onImportBookmarks: () => void
  onExportBookmarks: (format: BookmarkTransferFormat) => void
  onDeleteAccount: () => void
  onOpenAbout: () => void
}

const SectionCard: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <View className="gap-3">
    <Text className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{title}</Text>
    <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
      {children}
    </View>
  </View>
)

const SettingsBadge: React.FC<{ label: string }> = ({ label }) => (
  <View className="rounded-full border border-stone-300 bg-stone-100 px-3 py-1 dark:border-stone-700 dark:bg-stone-950">
    <Text className="text-xs text-stone-700 dark:text-stone-300">{label}</Text>
  </View>
)

export const SyncSettingsSections: React.FC<{ actions: SettingsActions }> = ({ actions }) => {
  const userId = useValue(auth$.userId)

  if (!userId) {
    return <SyncSignInSection />
  }

  return (
    <>
      <AccountSection actions={actions} />
      <PlanSection actions={actions} />
    </>
  )
}

const usePlanCopy = () => {
  const { t } = useTranslation()
  const userId = useValue(auth$.userId)
  const plan = useValue(auth$.plan)
  const planLabel = plan === 'sync' ? t('settings.plan.sync') : t('settings.plan.free')
  const syncHint = userId && (!plan || plan === 'free') ? t('settings.sync.upgradeHint') : t('settings.sync.syncHint')

  return { plan, planLabel, syncHint }
}

const SyncSignInSection: React.FC = () => {
  const { t } = useTranslation()
  const { syncHint } = usePlanCopy()

  return (
    <SectionCard title={t('settings.sync.label')}>
      <View className="px-5 py-5">
        <Text className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t('settings.sync.label')}</Text>
        <Text className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{syncHint}</Text>
        <View className="mt-5">
          <Pressable
            onPress={() => void startHostedSignIn()}
            className="items-center rounded-full bg-stone-900 px-5 py-2.5 active:opacity-80 dark:bg-stone-100"
          >
            <Text className="text-sm font-medium text-stone-50 dark:text-stone-950">{t('settings.sync.signIn')}</Text>
          </Pressable>
        </View>
      </View>
    </SectionCard>
  )
}

const AccountSection: React.FC<{ actions: SettingsActions }> = ({ actions }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const userEmail = useValue(auth$.userEmail)
  const user = useValue(auth$.user)
  const source = useValue(auth$.source)
  const { plan, planLabel } = usePlanCopy()
  const accountMenuItems: NouMenuItem[] = [
    ...(isIos && source === 'app_store' && plan === 'sync'
      ? [{ id: 'manage-subscription', label: t('settings.ios.manage'), handler: () => void actions.onManage() }]
      : []),
    ...(isIos ? [{ id: 'restore-purchase', label: t('settings.ios.restore'), handler: () => void actions.onRestore() }] : []),
    { id: 'sync-now', label: t('settings.sync.syncNow'), icon: 'cloud-sync' as const, handler: () => void actions.onManualSync() },
    ...(isIos ? [{ id: 'delete-account', label: t('settings.sync.deleteAccount'), icon: 'delete-outline' as const }] : []),
    { id: 'sign-out', label: t('settings.sync.signOut'), handler: () => void signOut() },
  ]

  return (
    <SectionCard title={t('settings.sync.label')}>
      <View className="flex-row items-center gap-3 px-4 py-4">
        <Image style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#18181b' }} source={user?.picture} contentFit="cover" />
        <View className="flex-1">
          <Text className="font-medium text-stone-900 dark:text-stone-100">
            {userEmail || user?.email || t('settings.sync.noriUser')}
          </Text>
          <Text className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('settings.sync.plan', { plan: planLabel })}</Text>
        </View>
        <NouMenu
          trigger={<MaterialIcons name="more-vert" size={20} color={themeColors.iconMuted} />}
          items={accountMenuItems}
          onSelectItem={(item) => {
            if (item.id === 'delete-account') {
              actions.onDeleteAccount()
              return
            }
            item.handler?.()
          }}
        />
      </View>
    </SectionCard>
  )
}

const PlanSection: React.FC<{ actions: SettingsActions }> = ({ actions }) => {
  const { t } = useTranslation()
  const source = useValue(auth$.source)
  const ios = useValue(auth$.ios)
  const authRefreshing = useValue(auth$.refreshing)
  const authError = useValue(auth$.lastError)
  const syncInFlight = useValue(syncMeta$.inFlight)
  const syncError = useValue(syncMeta$.lastError)
  const lastSyncAt = useValue(syncMeta$.lastSyncAt)
  const { plan, planLabel, syncHint } = usePlanCopy()
  const iosStatusText = ios?.expiresAt ? t('settings.ios.expires', { date: new Date(ios.expiresAt).toLocaleString() }) : null

  return (
    <SectionCard title={t('settings.plan.label')}>
      <View className="px-5 py-5">
        <View className="flex-row flex-wrap gap-2">
          <SettingsBadge label={planLabel} />
          {source === 'app_store' ? <SettingsBadge label={t('settings.plan.activeAppStore')} /> : null}
        </View>
        <Text className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">{syncHint}</Text>
        {iosStatusText ? <Text className="mt-3 text-xs text-stone-500 dark:text-stone-500">{iosStatusText}</Text> : null}
        {lastSyncAt ? (
          <Text className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {t('settings.sync.lastSynced', { date: new Date(lastSyncAt).toLocaleString() })}
          </Text>
        ) : null}
        {authRefreshing || syncInFlight ? <Text className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('settings.sync.working')}</Text> : null}
        {authError || syncError || actions.actionError ? (
          <Text className="mt-3 text-sm text-rose-600 dark:text-rose-400">{authError || syncError || actions.actionError}</Text>
        ) : null}
        {isIos ? (
          <IosPlanActions
            plan={plan}
            source={source}
            loadingProduct={actions.loadingProduct}
            productPrice={actions.productPrice}
            busyAction={actions.busyAction}
            onPurchase={actions.onPurchase}
          />
        ) : (
          <WebPlanActions source={source} onManage={actions.onManage} />
        )}
      </View>
    </SectionCard>
  )
}

const IosPlanActions: React.FC<{
  plan: string
  source: string
  loadingProduct: boolean
  productPrice?: string
  busyAction: SettingsBusyAction
  onPurchase: () => void
}> = ({ plan, source, loadingProduct, productPrice, busyAction, onPurchase }) => {
  const { t } = useTranslation()

  return (
    <View className="mt-5 gap-3">
      {loadingProduct ? <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.ios.loadingPrice')}</Text> : null}
      {!loadingProduct && !productPrice ? <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.ios.productUnavailable')}</Text> : null}
      {source === 'app_store' && plan === 'sync' ? (
        busyAction === 'manage' || busyAction === 'restore' ? (
          <Text className="text-sm text-stone-400">
            {busyAction === 'manage' ? t('settings.ios.managing') : t('settings.ios.restoring')}
          </Text>
        ) : null
      ) : (
        <Pressable
          onPress={onPurchase}
          disabled={loadingProduct || !productPrice}
          className="items-center rounded-2xl bg-emerald-600 px-4 py-3 active:opacity-80 disabled:opacity-50"
        >
          <Text className="font-medium text-white">
            {busyAction === 'buy'
              ? t('settings.ios.purchasing')
              : productPrice
                ? t('settings.ios.buyPrice', { price: productPrice })
                : t('settings.ios.buy')}
          </Text>
        </Pressable>
      )}
      <View className="gap-2 rounded-2xl border border-stone-300 bg-stone-100/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/70">
        <Text className="text-xs leading-5 text-stone-600 dark:text-stone-400">{t('settings.ios.legalHint')}</Text>
        <View className="flex-row flex-wrap gap-3">
          <Text className="text-xs text-stone-900 underline dark:text-stone-100" onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}>
            {t('settings.ios.termsOfUse')}
          </Text>
          <Text className="text-xs text-stone-900 underline dark:text-stone-100" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            {t('settings.ios.privacyPolicy')}
          </Text>
        </View>
      </View>
    </View>
  )
}

const WebPlanActions: React.FC<{ source: string; onManage: () => void }> = ({ source, onManage }) => {
  const { t } = useTranslation()

  return (
    <View className="mt-5">
      {source === 'app_store' ? (
        <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.plan.activeAppStore')}</Text>
      ) : (
        <Pressable
          onPress={onManage}
          className="items-center rounded-full border border-stone-300 bg-stone-100 px-5 py-2.5 active:opacity-80 dark:border-stone-700 dark:bg-stone-950"
        >
          <Text className="text-sm text-stone-900 dark:text-stone-100">{t('settings.plan.manage')}</Text>
        </Pressable>
      )}
    </View>
  )
}

const languageNativeNames: Record<string, string> = {
  ar: 'العربية',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pl: 'Polski',
  pt_BR: 'Português (Brasil)',
  sv: 'Svenska',
  tr: 'Türkçe',
  zh_Hans: '简体中文',
  zh_Hant: '繁體中文',
}

const quickSaveTargetListId = (listId: string, visibleLists: { id: string }[]) =>
  visibleLists.some((list) => list.id === listId) ? listId : ''

export const ExperienceSection: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const theme = useValue(settings$.theme)
  const openInSystemBrowser = useValue(settings$.openInSystemBrowser)
  const showFavicon = useValue(settings$.showFavicon)
  const quickSaveSharedLinks = useValue(settings$.quickSaveSharedLinks)
  const quickSaveShareListId = useValue(settings$.quickSaveShareListId)
  const selectedLanguage = useValue(settings$.language)
  const lists = useValue(lists$.lists)
  const locales = useLocales()
  const visibleLists = getVisibleLists(lists)
  const quickShareTargetList = visibleLists.find((list) => list.id === quickSaveShareListId) || visibleLists[0]

  const systemLanguage = resolveI18nLanguageFromExpoLocale(locales[0]) || 'en'
  const effectiveLanguage = selectedLanguage || systemLanguage

  const toLanguageLabel = (code: string) => languageNativeNames[code] || code
  const currentLanguageLabel = selectedLanguage
    ? toLanguageLabel(selectedLanguage)
    : `${t('settings.experience.languageSystem')} (${toLanguageLabel(effectiveLanguage)})`

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
      <View className="border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <MaterialIcons name="open-in-browser" color={themeColors.iconMuted} size={18} />
          </View>
          <View className="flex-1">
            <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.defaultBrowser')}</Text>
            <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{t('settings.experience.defaultBrowserHint')}</Text>
          </View>
          <Pressable
            onPress={() => settings$.setOpenInSystemBrowser(!openInSystemBrowser)}
            className={`h-8 w-14 rounded-full p-1 ${openInSystemBrowser ? 'bg-emerald-500' : 'bg-stone-700'}`}
          >
            <View className={`h-6 w-6 rounded-full bg-white ${openInSystemBrowser ? 'ml-auto' : ''}`} />
          </Pressable>
        </View>
      </View>
      <View className="border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <MaterialIcons name="save-alt" color={themeColors.iconMuted} size={18} />
          </View>
          <View className="flex-1">
            <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.quickShare')}</Text>
            <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{t('settings.experience.quickShareHint')}</Text>
          </View>
          <Pressable
            onPress={toggleQuickShare}
            disabled={visibleLists.length === 0}
            className={`h-8 w-14 rounded-full p-1 ${quickSaveSharedLinks ? 'bg-emerald-500' : 'bg-stone-700'} disabled:opacity-50`}
          >
            <View className={`h-6 w-6 rounded-full bg-white ${quickSaveSharedLinks ? 'ml-auto' : ''}`} />
          </Pressable>
        </View>
        {quickSaveSharedLinks ? (
          <View className="mt-3 flex-row justify-end">
            <NouMenu
              trigger={
                <View className="flex-row items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1.5 dark:border-stone-700 dark:bg-stone-950">
                  <Text className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    {quickShareTargetList?.name || t('lists.unknown')}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.iconMuted} />
                </View>
              }
              items={quickShareListMenuItems}
            />
          </View>
        ) : null}
      </View>
      <View className="border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <MaterialIcons name="image" color={themeColors.iconMuted} size={18} />
          </View>
          <View className="flex-1">
            <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.showFavicon')}</Text>
            <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{t('settings.experience.showFaviconHint')}</Text>
          </View>
          <Pressable
            onPress={() => settings$.setShowFavicon(showFavicon === false)}
            className={`h-8 w-14 rounded-full p-1 ${showFavicon !== false ? 'bg-emerald-500' : 'bg-stone-700'}`}
          >
            <View className={`h-6 w-6 rounded-full bg-white ${showFavicon !== false ? 'ml-auto' : ''}`} />
          </Pressable>
        </View>
      </View>
      <View className="border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <MaterialIcons name="translate" color={themeColors.iconMuted} size={18} />
          </View>
          <View className="flex-1">
            <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.language')}</Text>
            <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{t('settings.experience.languageHint')}</Text>
          </View>
          <NouMenu
            trigger={
              <View className="flex-row items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-3 py-1.5 dark:border-stone-700 dark:bg-stone-950">
                <Text className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  {currentLanguageLabel}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.iconMuted} />
              </View>
            }
            items={languageMenuItems}
          />
        </View>
      </View>
      <View className="px-4 py-4">
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <MaterialIcons name="palette" color={themeColors.iconMuted} size={18} />
          </View>
          <View className="flex-1">
            <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.theme')}</Text>
            <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">{t('settings.experience.themeHint')}</Text>
          </View>
        </View>
        <View className="flex-row justify-end gap-2">
          <SegmentedOption label={t('settings.experience.system')} active={theme === null} onPress={() => settings$.theme.set(null)} />
          <SegmentedOption label={t('settings.experience.light')} active={theme === 'light'} onPress={() => settings$.theme.set('light')} />
          <SegmentedOption label={t('settings.experience.dark')} active={theme === 'dark'} onPress={() => settings$.theme.set('dark')} />
        </View>
      </View>
    </SectionCard>
  )
}

export const TransferSection: React.FC<{ actions: SettingsActions }> = ({ actions }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()

  return (
    <SectionCard title={t('settings.transfer.label')}>
      <AboutRow
        icon="file-upload"
        title={t('settings.transfer.import')}
        detail={actions.busyAction === 'import' ? t('settings.transfer.importing') : t('settings.transfer.importHint')}
        onPress={actions.onImportBookmarks}
        themeColors={themeColors}
      />
      <AboutRow
        icon="html"
        title={t('settings.transfer.exportHtml')}
        detail={actions.busyAction === 'export-html' ? t('settings.transfer.exporting') : t('settings.transfer.exportHtmlHint')}
        onPress={() => actions.onExportBookmarks('html')}
        themeColors={themeColors}
      />
      <AboutRow
        icon="subject"
        title={t('settings.transfer.exportPlain')}
        detail={actions.busyAction === 'export-plain' ? t('settings.transfer.exporting') : t('settings.transfer.exportPlainHint')}
        onPress={() => actions.onExportBookmarks('plain')}
        themeColors={themeColors}
      />
      <AboutRow
        icon="backup"
        title={t('settings.transfer.exportBackup')}
        detail={actions.busyAction === 'export-json' ? t('settings.transfer.exporting') : t('settings.transfer.exportBackupHint')}
        onPress={() => actions.onExportBookmarks('json')}
        themeColors={themeColors}
        isLast
      />
    </SectionCard>
  )
}
