import { Linking, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Image } from 'expo-image'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { auth$ } from '@/states/auth'
import { syncMeta$ } from '@/states/sync-meta'
import { useThemeColors } from '@/lib/theme'
import { isIos } from '@/lib/utils'
import { signOut, startHostedSignIn } from '@/lib/supabase/auth'
import type { BookmarkTransferFormat } from '@/lib/bookmark-transfer'
import { canSaveTextFile } from '@/modules/nori-file-save'
import type { NoriBillingProduct } from '@/modules/nori-billing'
import type { BookmarkExportTarget } from '@/components/sheet/useSettingsSheetActions'
import { AboutRow } from '@/components/sheet/SettingsSheetAbout'
import { SectionCard } from '@/components/sheet/SettingsSheetPreferences'

const TERMS_OF_USE_URL = 'https://www.apple.com/legal/macapps/stdeula/'
const PRIVACY_POLICY_URL = 'https://inks.page/p/privacy'

export type SettingsBusyAction =
  'buy' | 'restore' | 'manage' | 'sync' | 'import' | 'export-html' | 'export-plain' | 'export-json' | null

export interface SettingsActions {
  actionError?: string
  notice?: string
  busyAction: SettingsBusyAction
  loadingProduct: boolean
  product?: NoriBillingProduct
  onPurchase: () => void
  onRestore: () => void
  onManage: () => void
  onManualSync: () => void
  onImportBookmarks: () => void
  onExportBookmarks: (format: BookmarkTransferFormat, target?: BookmarkExportTarget) => void
  onDeleteAccount: () => void
  onOpenAbout: () => void
  onOpenChangelog: () => void
}


const SettingsBadge: React.FC<{ label: string }> = ({ label }) => (
  <View className="rounded-full bg-well px-3 py-1">
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
        {actions.notice ? <NoriText className="mt-3 text-sm text-content-muted">{actions.notice}</NoriText> : null}
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
            product={actions.product}
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
  product?: NoriBillingProduct
  busyAction: SettingsBusyAction
  onPurchase: () => void
}> = ({ plan, source, loadingProduct, product, busyAction, onPurchase }) => {
  const { t } = useTranslation()
  const productPrice = product?.displayPrice

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
      <View className="gap-2 rounded-2xl bg-well px-4 py-3">
        {product ? (
          <View>
            <NoriText className="text-sm font-medium text-content">{product.title || 'Nori Sync'}</NoriText>
            {product.subscriptionPeriod ? (
              <NoriText className="text-xs leading-5 text-content-muted">
                {t('settings.ios.subscriptionLength', { period: product.subscriptionPeriod })}
              </NoriText>
            ) : null}
            <NoriText className="text-xs leading-5 text-content-muted">
              {t('settings.ios.subscriptionPrice', { price: product.displayPrice })}
            </NoriText>
            <NoriText className="text-xs leading-5 text-content-muted">
              {t('settings.ios.subscriptionIncludes')}
            </NoriText>
          </View>
        ) : null}
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

const EXPORT_ROWS = [
  { format: 'html', icon: 'html', title: 'exportHtml', hint: 'exportHtmlHint' },
  { format: 'plain', icon: 'subject', title: 'exportPlain', hint: 'exportPlainHint' },
  { format: 'json', icon: 'backup', title: 'exportBackup', hint: 'exportBackupHint' },
] as const

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
      {EXPORT_ROWS.map(({ format, icon, title, hint }, index) => {
        const row = {
          icon,
          title: t(`settings.transfer.${title}`),
          detail:
            actions.busyAction === `export-${format}`
              ? t('settings.transfer.exporting')
              : t(`settings.transfer.${hint}`),
          themeColors,
          isLast: index === EXPORT_ROWS.length - 1,
        }
        if (!canSaveTextFile) {
          return <AboutRow key={format} {...row} onPress={() => actions.onExportBookmarks(format)} />
        }
        // Android's share sheet has no "save to Files" target, so offer it here.
        return (
          <NouMenu
            key={format}
            trigger={<AboutRow {...row} showChevron />}
            items={[
              {
                label: t('settings.transfer.saveToDevice'),
                icon: 'save-alt',
                handler: () => actions.onExportBookmarks(format, 'save'),
              },
              {
                label: t('bookmarks.share'),
                icon: 'share',
                handler: () => actions.onExportBookmarks(format, 'share'),
              },
            ]}
          />
        )
      })}
    </SectionCard>
  )
}
