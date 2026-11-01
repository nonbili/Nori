import { useValue } from '@legendapp/state/react'
import { t as translate } from 'i18next'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'
import { resolveAccountChoice, type AccountChoice } from '@/lib/supabase/sync-account'
import { accountChoice$ } from '@/lib/supabase/sync-session'
import { showToast } from '@/lib/toast'

export const chooseAccountData = (choice: AccountChoice) =>
  resolveAccountChoice(choice).catch((error) => {
    showToast(translate('settings.sync.accountChoiceFailed', { message: error instanceof Error ? error.message : String(error) }))
  })

/** Asks once a session what to do when the data on this device belongs to another account. */
export function useAccountChoicePrompt() {
  const { t } = useTranslation()
  const needed = useValue(accountChoice$)

  useEffect(() => {
    if (!needed) return
    Alert.alert(t('settings.sync.accountChoiceTitle'), t('settings.sync.accountChoiceMessage'), [
      { text: t('settings.sync.accountChoiceLater'), style: 'cancel' },
      { text: t('settings.sync.accountChoiceMerge'), onPress: () => void chooseAccountData('mergeDevice') },
      { text: t('settings.sync.accountChoiceUseAccount'), onPress: () => void chooseAccountData('useAccount') },
    ])
  }, [needed, t])
}
