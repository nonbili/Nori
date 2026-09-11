import { useState, type ReactNode } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
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
import { useAppColorScheme, useThemeColors } from '@/lib/theme'
import { ACCENT_IDS, accentColor, isCustomAccent, normalizeAccent } from '@/lib/accent'
import { isIos } from '@/lib/utils'
import { signOut, startHostedSignIn } from '@/lib/supabase/auth'
import type { BookmarkTransferFormat } from '@/lib/bookmark-transfer'
import { AboutRow } from '@/components/sheet/SettingsSheetAbout'
import { CustomAccentPicker } from '@/components/sheet/AccentPicker'
import { useLocales } from 'expo-localization'
import { resolveI18nLanguageFromExpoLocale, supportedI18nLanguages } from '@/lib/i18n'
import { languageNativeNames } from '@/lib/language'
import { getVisibleLists } from '@/lib/nori-data'

const TERMS_OF_USE_URL = 'https://www.apple.com/legal/macapps/stdeula/'
const PRIVACY_POLICY_URL = 'https://inks.page/p/privacy'

export type SettingsBusyAction =
  'buy' | 'restore' | 'manage' | 'sync' | 'import' | 'export-html' | 'export-plain' | 'export-json' | null

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
  onOpenChangelog: () => void
}

const SectionCard: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <View className="gap-3">
    <NoriText className="px-1 text-xs uppercase tracking-[0.18em] text-content-subtle">{title}</NoriText>
    <View className="overflow-hidden rounded-[24px] border border-line bg-surface/90 dark:bg-surface/70">
      {children}
    </View>
  </View>
)

const SettingsBadge: React.FC<{ label: string }> = ({ label }) => (
  <View className="rounded-full border border-line-strong bg-well px-3 py-1">
    <NoriText className="text-xs text-content-secondary">{label}</NoriText>
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
        <NoriText className="text-lg font-semibold text-content">{t('settings.sync.label')}</NoriText>
        <NoriText className="mt-2 text-sm leading-6 text-content-muted">{syncHint}</NoriText>
        <View className="mt-5">
          <Pressable
            onPress={() => void startHostedSignIn()}
            className="items-center rounded-full bg-accent-fill px-5 py-2.5 active:bg-accent-fill-pressed"
          >
            <NoriText className="text-sm font-medium text-accent-on">{t('settings.sync.signIn')}</NoriText>
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
    ...(isIos
      ? [{ id: 'restore-purchase', label: t('settings.ios.restore'), handler: () => void actions.onRestore() }]
      : []),
    {
      id: 'sync-now',
      label: t('settings.sync.syncNow'),
      icon: 'cloud-sync' as const,
      handler: () => void actions.onManualSync(),
    },
    ...(isIos
      ? [{ id: 'delete-account', label: t('settings.sync.deleteAccount'), icon: 'delete-outline' as const }]
      : []),
    { id: 'sign-out', label: t('settings.sync.signOut'), handler: () => void signOut() },
  ]

  return (
    <SectionCard title={t('settings.sync.label')}>
      <View className="flex-row items-center gap-3 px-4 py-4">
        <Image
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#18181b' }}
          source={user?.picture}
          contentFit="cover"
        />
        <View className="flex-1">
          <NoriText className="font-medium text-content">
            {userEmail || user?.email || t('settings.sync.noriUser')}
          </NoriText>
          <NoriText className="mt-1 text-sm text-content-muted">
            {t('settings.sync.plan', { plan: planLabel })}
          </NoriText>
        </View>
        <NouMenu
          trigger={<MaterialIcons name="more-vert" size={20} color={themeColors.contentMuted} />}
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
  const iosStatusText = ios?.expiresAt
    ? t('settings.ios.expires', { date: new Date(ios.expiresAt).toLocaleString() })
    : null

  return (
    <SectionCard title={t('settings.plan.label')}>
      <View className="px-5 py-5">
        <View className="flex-row flex-wrap gap-2">
          <SettingsBadge label={planLabel} />
          {source === 'app_store' ? <SettingsBadge label={t('settings.plan.activeAppStore')} /> : null}
        </View>
        <NoriText className="mt-4 text-sm leading-6 text-content-muted">{syncHint}</NoriText>
        {iosStatusText ? (
          <NoriText className="mt-3 text-xs text-content-subtle">{iosStatusText}</NoriText>
        ) : null}
        {lastSyncAt ? (
          <NoriText className="mt-1 text-xs text-content-muted">
            {t('settings.sync.lastSynced', { date: new Date(lastSyncAt).toLocaleString() })}
          </NoriText>
        ) : null}
        {authRefreshing || syncInFlight ? (
          <NoriText className="mt-1 text-xs text-content-muted">{t('settings.sync.working')}</NoriText>
        ) : null}
        {authError || syncError || actions.actionError ? (
          <NoriText className="mt-3 text-sm text-danger-600 dark:text-danger-400">
            {authError || syncError || actions.actionError}
          </NoriText>
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
      {loadingProduct ? (
        <NoriText className="text-sm text-content-muted">{t('settings.ios.loadingPrice')}</NoriText>
      ) : null}
      {!loadingProduct && !productPrice ? (
        <NoriText className="text-sm text-content-muted">{t('settings.ios.productUnavailable')}</NoriText>
      ) : null}
      {source === 'app_store' && plan === 'sync' ? (
        busyAction === 'manage' || busyAction === 'restore' ? (
          <NoriText className="text-sm text-content-subtle">
            {busyAction === 'manage' ? t('settings.ios.managing') : t('settings.ios.restoring')}
          </NoriText>
        ) : null
      ) : (
        <Pressable
          onPress={onPurchase}
          disabled={loadingProduct || !productPrice}
          className="items-center rounded-2xl bg-accent-fill px-4 py-3 active:opacity-80 disabled:opacity-50"
        >
          <NoriText className="font-medium text-accent-on">
            {busyAction === 'buy'
              ? t('settings.ios.purchasing')
              : productPrice
                ? t('settings.ios.buyPrice', { price: productPrice })
                : t('settings.ios.buy')}
          </NoriText>
        </Pressable>
      )}
      <View className="gap-2 rounded-2xl border border-line-strong bg-well/80 px-4 py-3 dark:border-line dark:bg-well/70">
        <NoriText className="text-xs leading-5 text-content-muted">{t('settings.ios.legalHint')}</NoriText>
        <View className="flex-row flex-wrap gap-3">
          <NoriText
            className="text-xs text-content underline"
            onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
          >
            {t('settings.ios.termsOfUse')}
          </NoriText>
          <NoriText
            className="text-xs text-content underline"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          >
            {t('settings.ios.privacyPolicy')}
          </NoriText>
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
        <NoriText className="text-sm text-content-muted">{t('settings.plan.activeAppStore')}</NoriText>
      ) : (
        <Pressable
          onPress={onManage}
          className="items-center rounded-full border border-line-strong bg-well px-5 py-2.5 active:opacity-80"
        >
          <NoriText className="text-sm text-content">{t('settings.plan.manage')}</NoriText>
        </Pressable>
      )}
    </View>
  )
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

  const toLanguageLabel = (code: string) => languageNativeNames[code as keyof typeof languageNativeNames] || code
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
      <View className="border-b border-line px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
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
      <View className="border-b border-line px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
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
      <View className="border-b border-line px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
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
      <View className="border-b border-line px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
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
      <View className="border-b border-line px-4 py-4">
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
            <MaterialIcons name="palette" color={themeColors.contentMuted} size={18} />
          </View>
          <View className="flex-1">
            <NoriText className="font-medium text-content">{t('settings.experience.theme')}</NoriText>
            <NoriText className="mt-1 text-sm leading-5 text-content-muted">
              {t('settings.experience.themeHint')}
            </NoriText>
          </View>
        </View>
        <View className="flex-row justify-end gap-2">
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
        </View>
      </View>
      <AccentRow />
    </SectionCard>
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
  // Opens showing the picker when a custom accent is already in use, so the
  // strips are where the current colour came from rather than a hidden state.
  const [pickerOpen, setPickerOpen] = useState(custom)

  return (
    <View className="px-4 py-4">
      <View className="mb-3 flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
          <MaterialIcons name="color-lens" color={themeColors.contentMuted} size={18} />
        </View>
        <View className="flex-1">
          <NoriText className="font-medium text-content">{t('settings.experience.accent')}</NoriText>
          <NoriText className="mt-1 text-sm leading-5 text-content-muted">
            {t('settings.experience.accentHint')}
          </NoriText>
        </View>
      </View>
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
        <Pressable
          onPress={() => setPickerOpen((open) => !open)}
          accessibilityRole="radio"
          accessibilityState={{ selected: custom, expanded: pickerOpen }}
          accessibilityLabel={t('settings.experience.accentCustom')}
          className={`h-9 w-9 items-center justify-center rounded-full border-2 active:opacity-70 ${
            custom ? 'border-content' : 'border-transparent'
          }`}
        >
          <View
            className="h-6 w-6 items-center justify-center rounded-full border border-line"
            style={custom ? { backgroundColor: accentColor(accent, isDark ? 400 : 600) } : undefined}
          >
            <MaterialIcons
              name={custom ? 'check' : 'palette'}
              // The check is a single stroke and reads at the preset swatches'
              // 14; the palette glyph carries far more detail in the same box.
              size={custom ? 14 : 18}
              color={custom ? themeColors.contentInverse : themeColors.contentMuted}
            />
          </View>
        </Pressable>
      </View>
      {pickerOpen ? (
        <CustomAccentPicker value={accent} onChange={(next) => settings$.setAccent(next)} />
      ) : null}
    </View>
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
        detail={
          actions.busyAction === 'export-html'
            ? t('settings.transfer.exporting')
            : t('settings.transfer.exportHtmlHint')
        }
        onPress={() => actions.onExportBookmarks('html')}
        themeColors={themeColors}
      />
      <AboutRow
        icon="subject"
        title={t('settings.transfer.exportPlain')}
        detail={
          actions.busyAction === 'export-plain'
            ? t('settings.transfer.exporting')
            : t('settings.transfer.exportPlainHint')
        }
        onPress={() => actions.onExportBookmarks('plain')}
        themeColors={themeColors}
      />
      <AboutRow
        icon="backup"
        title={t('settings.transfer.exportBackup')}
        detail={
          actions.busyAction === 'export-json'
            ? t('settings.transfer.exporting')
            : t('settings.transfer.exportBackupHint')
        }
        onPress={() => actions.onExportBookmarks('json')}
        themeColors={themeColors}
        isLast
      />
    </SectionCard>
  )
}
