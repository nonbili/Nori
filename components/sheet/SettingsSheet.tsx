import { Alert, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { useValue } from '@legendapp/state/react'
import { useTranslation } from 'react-i18next'
import NoriBilling from '@/modules/nori-billing'
import { prepareIosPurchase, syncIosTransaction } from '@/lib/nori-api'
import { openDeleteAccount, openManagePlan, signOut, startHostedSignIn } from '@/lib/supabase/auth'
import { syncSupabase } from '@/lib/supabase/sync'
import { settings$ } from '@/states/settings'
import { auth$, refreshEntitlement } from '@/states/auth'
import { syncMeta$ } from '@/states/sync-meta'
import { ui$ } from '@/states/ui'
import { useThemeColors } from '@/lib/theme'
import { isIos } from '@/lib/utils'
import { SegmentedOption } from '@/components/common/Common'
import { NouMenu, type NouMenuItem } from '@/components/menu/NouMenu'
import { Sheet } from '@/components/modal/BaseModal'

const IOS_SYNC_PRODUCT_ID = process.env.EXPO_PUBLIC_NORI_IOS_SYNC_PRODUCT_ID || 'jp.nonbili.nori.sync'
const TERMS_OF_USE_URL = 'https://www.apple.com/legal/macapps/stdeula/'
const PRIVACY_POLICY_URL = 'https://inks.page/p/privacy'

const SettingsBadge: React.FC<{ label: string }> = ({ label }) => (
  <View className="rounded-full border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-950 px-3 py-1">
    <Text className="text-xs text-stone-700 dark:text-stone-300">{label}</Text>
  </View>
)

export const SettingsSheet: React.FC = () => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const { height: windowHeight } = useWindowDimensions()
  const theme = useValue(settings$.theme)
  const openInSystemBrowser = useValue(settings$.openInSystemBrowser)
  const visible = useValue(ui$.settingsSheetOpen)
  const userId = useValue(auth$.userId)
  const userEmail = useValue(auth$.userEmail)
  const user = useValue(auth$.user)
  const plan = useValue(auth$.plan)
  const source = useValue(auth$.source)
  const ios = useValue(auth$.ios)
  const authRefreshing = useValue(auth$.refreshing)
  const authError = useValue(auth$.lastError)
  const syncInFlight = useValue(syncMeta$.inFlight)
  const syncError = useValue(syncMeta$.lastError)
  const lastSyncAt = useValue(syncMeta$.lastSyncAt)
  const accessToken = useValue(auth$.accessToken)
  const [loadingProduct, setLoadingProduct] = useState(isIos)
  const [productPrice, setProductPrice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [busyAction, setBusyAction] = useState<'buy' | 'restore' | 'manage' | 'sync' | null>(null)
  const [pendingExternalAction, setPendingExternalAction] = useState<'delete-account' | null>(null)

  useEffect(() => {
    if (!isIos) {
      return
    }

    let active = true
    const loadProduct = async () => {
      try {
        const products = await NoriBilling.getProducts([IOS_SYNC_PRODUCT_ID])
        if (active) {
          setProductPrice(products[0]?.displayPrice)
        }
      } catch (error) {
        if (active) {
          setActionError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (active) {
          setLoadingProduct(false)
        }
      }
    }

    void loadProduct()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (pendingExternalAction !== 'delete-account') {
      return
    }
    setPendingExternalAction(null)
    if (!accessToken) {
      setActionError(t('settings.sync.signIn'))
      return
    }
    void openDeleteAccount(accessToken).catch((error) => {
      setActionError(error instanceof Error ? error.message : String(error))
    })
  }, [accessToken, pendingExternalAction, t])

  const runAction = async (name: 'buy' | 'restore' | 'manage' | 'sync', fn: () => Promise<void>) => {
    setBusyAction(name)
    setActionError(undefined)
    try {
      await fn()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(null)
    }
  }

  const confirmAccountBinding = () =>
    new Promise<boolean>((resolve) => {
      Alert.alert(
        t('settings.sync.confirmTitle'),
        t('settings.sync.confirmBody', { email: userEmail || 'your Nori account' }),
        [
          { text: t('lists.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('bookmarks.save'), onPress: () => resolve(true) }, // Using save for Confirm/Confirm
        ],
      )
    })

  const onPurchase = () =>
    runAction('buy', async () => {
      if (!accessToken || !userEmail) {
        throw new Error(t('settings.sync.errorSignInBuy'))
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      const prepared = await prepareIosPurchase(accessToken)
      const result = await NoriBilling.purchase(IOS_SYNC_PRODUCT_ID, prepared.appAccountToken)
      await syncIosTransaction(accessToken, result.signedTransactionInfo)
      await refreshEntitlement()
      await syncSupabase()
    })

  const onRestore = () =>
    runAction('restore', async () => {
      if (!accessToken || !userEmail) {
        throw new Error(t('settings.sync.errorSignInRestore'))
      }
      if (!(await confirmAccountBinding())) {
        return
      }
      await prepareIosPurchase(accessToken)
      const entitlements = await NoriBilling.restore()
      const restored = entitlements.find((entry) => entry.productId === IOS_SYNC_PRODUCT_ID)
      if (!restored) {
        throw new Error(t('settings.sync.errorNoPurchase'))
      }
      await syncIosTransaction(accessToken, restored.signedTransactionInfo)
      await refreshEntitlement()
      await syncSupabase()
    })

  const onManage = () =>
    runAction('manage', async () => {
      if (isIos) {
        await NoriBilling.manageSubscriptions()
        return
      }
      await openManagePlan()
    })

  const onManualSync = () =>
    runAction('sync', async () => {
      await syncSupabase()
      await refreshEntitlement()
    })

  const planLabel = plan === 'sync' ? t('settings.plan.sync') : t('settings.plan.free')
  const syncHint =
    userId && (!plan || plan === 'free')
      ? t('settings.sync.upgradeHint')
      : t('settings.sync.syncHint')

  const iosStatusText = useMemo(() => {
    if (!ios?.expiresAt) {
      return null
    }
    return t('settings.ios.expires', { date: new Date(ios.expiresAt).toLocaleString() })
  }, [ios?.expiresAt, t])

  const accountMenuItems: NouMenuItem[] = [
    ...(isIos && source === 'app_store' && plan === 'sync'
      ? [{ id: 'manage-subscription', label: t('settings.ios.manage'), handler: () => void onManage() }]
      : []),
    ...(isIos ? [{ id: 'restore-purchase', label: t('settings.ios.restore'), handler: () => void onRestore() }] : []),
    { id: 'sync-now', label: t('settings.sync.syncNow'), icon: 'cloud-sync' as const, handler: () => void onManualSync() },
    ...(isIos
      ? [{ id: 'delete-account', label: t('settings.sync.deleteAccount'), icon: 'delete-outline' as const }]
      : []),
    { id: 'sign-out', label: t('settings.sync.signOut'), handler: () => void signOut() },
  ]

  return (
    <Sheet visible={visible} title={t('settings.title')} height={windowHeight * 0.85} onClose={() => ui$.settingsSheetOpen.set(false)}>
      <ScrollView showsVerticalScrollIndicator={false} className="flex-1" contentContainerClassName="gap-8 pb-4">
        {!userId ? (
          <View className="gap-3">
            <Text className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{t('settings.sync.label')}</Text>
            <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
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
            </View>
          </View>
        ) : (
          <>
            <View className="gap-3">
              <Text className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{t('settings.sync.label')}</Text>
              <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
                <View className="flex-row items-center gap-3 px-4 py-4">
                  <Image
                    style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#18181b' }}
                    source={user?.picture}
                    contentFit="cover"
                  />
                  <View className="flex-1">
                    <Text className="font-medium text-stone-900 dark:text-stone-100">
                      {userEmail || user?.email || t('settings.sync.noriUser')}
                    </Text>
                    <Text className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                      {t('settings.sync.plan', { plan: planLabel })}
                    </Text>
                  </View>
                  <NouMenu
                    trigger={<MaterialIcons name="more-vert" size={20} color={themeColors.iconMuted} />}
                    items={accountMenuItems}
                    onSelectItem={(item) => {
                      if (item.id === 'delete-account') {
                        setPendingExternalAction('delete-account')
                        return
                      }
                      item.handler?.()
                    }}
                  />
                </View>
              </View>
            </View>

            <View className="gap-3">
              <Text className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{t('settings.plan.label')}</Text>
              <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
                <View className="px-5 py-5">
                  <View className="flex-row flex-wrap gap-2">
                    <SettingsBadge label={planLabel} />
                    {source === 'app_store' ? <SettingsBadge label={t('settings.plan.activeAppStore')} /> : null}
                  </View>
                  <Text className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">{syncHint}</Text>
                  {iosStatusText ? (
                    <Text className="mt-3 text-xs text-stone-500 dark:text-stone-500">{iosStatusText}</Text>
                  ) : null}
                  {lastSyncAt ? (
                    <Text className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                      {t('settings.sync.lastSynced', { date: new Date(lastSyncAt).toLocaleString() })}
                    </Text>
                  ) : null}
                  {authRefreshing || syncInFlight ? (
                    <Text className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('settings.sync.working')}</Text>
                  ) : null}
                  {authError || syncError || actionError ? (
                    <Text className="mt-3 text-sm text-rose-600 dark:text-rose-400">{authError || syncError || actionError}</Text>
                  ) : null}
                  {isIos ? (
                    <View className="mt-5 gap-3">
                      {loadingProduct ? (
                        <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.ios.loadingPrice')}</Text>
                      ) : null}
                      {!loadingProduct && !productPrice ? (
                        <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.ios.productUnavailable')}</Text>
                      ) : null}
                      {source === 'app_store' && plan === 'sync' ? (
                        busyAction === 'manage' || busyAction === 'restore' ? (
                          <Text className="text-sm text-stone-400">
                            {busyAction === 'manage' ? t('settings.ios.managing') : t('settings.ios.restoring')}
                          </Text>
                        ) : null
                      ) : (
                        <Pressable
                          onPress={() => void onPurchase()}
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
                      <View className="gap-2 rounded-2xl border border-stone-300 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-950/70 px-4 py-3">
                        <Text className="text-xs leading-5 text-stone-600 dark:text-stone-400">
                          {t('settings.ios.legalHint')}
                        </Text>
                        <View className="flex-row flex-wrap gap-3">
                          <Text
                            className="text-xs text-stone-900 dark:text-stone-100 underline"
                            onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
                          >
                            {t('settings.ios.termsOfUse')}
                          </Text>
                          <Text
                            className="text-xs text-stone-900 dark:text-stone-100 underline"
                            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
                          >
                            {t('settings.ios.privacyPolicy')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className="mt-5">
                      {source === 'app_store' ? (
                        <Text className="text-sm text-stone-600 dark:text-stone-400">{t('settings.plan.activeAppStore')}</Text>
                      ) : (
                        <Pressable
                          onPress={() => void onManage()}
                          className="items-center rounded-full border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-950 px-5 py-2.5 active:opacity-80"
                        >
                          <Text className="text-sm text-stone-900 dark:text-stone-100">{t('settings.plan.manage')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        <View className="gap-3">
          <Text className="px-1 text-xs uppercase tracking-[0.18em] text-stone-500">{t('settings.experience.label')}</Text>
          <View className="overflow-hidden rounded-[24px] border border-stone-200 bg-white/90 dark:border-stone-800 dark:bg-stone-900/70">
            <View className="border-b border-stone-200 px-4 py-4 dark:border-stone-800">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
                  <MaterialIcons name="open-in-browser" color={themeColors.iconMuted} size={18} />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.defaultBrowser')}</Text>
                  <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">
                    {t('settings.experience.defaultBrowserHint')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => settings$.setOpenInSystemBrowser(!openInSystemBrowser)}
                  className={`h-8 w-14 rounded-full p-1 ${openInSystemBrowser ? 'bg-emerald-500' : 'bg-stone-700'}`}
                >
                  <View className={`h-6 w-6 rounded-full bg-white ${openInSystemBrowser ? 'ml-auto' : ''}`} />
                </Pressable>
              </View>
            </View>
            <View className="px-4 py-4">
              <View className="mb-3 flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
                  <MaterialIcons name="palette" color={themeColors.iconMuted} size={18} />
                </View>
                <View className="flex-1">
                  <Text className="font-medium text-stone-900 dark:text-stone-100">{t('settings.experience.theme')}</Text>
                  <Text className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">
                    {t('settings.experience.themeHint')}
                  </Text>
                </View>
              </View>
              <View className="flex-row justify-end gap-2">
                <SegmentedOption label={t('settings.experience.system')} active={theme === null} onPress={() => settings$.theme.set(null)} />
                <SegmentedOption label={t('settings.experience.light')} active={theme === 'light'} onPress={() => settings$.theme.set('light')} />
                <SegmentedOption label={t('settings.experience.dark')} active={theme === 'dark'} onPress={() => settings$.theme.set('dark')} />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </Sheet>
  )
}
