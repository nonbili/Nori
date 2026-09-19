import NoriBilling, { type NoriBillingEntitlement } from '@/modules/nori-billing'
import { syncIosTransaction } from '@/lib/nori-api'
import { syncSupabase } from '@/lib/supabase/sync'
import { isIos } from '@/lib/utils'
import { auth$, refreshEntitlement } from '@/states/auth'

export const IOS_SYNC_PRODUCT_ID = process.env.EXPO_PUBLIC_NORI_IOS_SYNC_PRODUCT_ID || 'jp.nonbili.nori.sync'

const delivering = new Map<string, Promise<void>>()

// A transaction is finished only after the backend has recorded it, so a
// failed request or a killed app leaves it in Transaction.unfinished for
// reconcileIosTransactions to deliver again.
export function deliverIosTransaction(accessToken: string, transaction: NoriBillingEntitlement) {
  let request = delivering.get(transaction.transactionId)
  if (!request) {
    request = (async () => {
      await syncIosTransaction(accessToken, transaction.signedTransactionInfo)
      await NoriBilling.finishTransaction(transaction.transactionId)
      await refreshEntitlement()
    })().finally(() => delivering.delete(transaction.transactionId))
    delivering.set(transaction.transactionId, request)
  }
  return request
}

const deliverInBackground = async (transaction: NoriBillingEntitlement) => {
  const accessToken = auth$.accessToken.peek()
  if (transaction.productId !== IOS_SYNC_PRODUCT_ID || !accessToken) {
    return
  }
  try {
    await deliverIosTransaction(accessToken, transaction)
    await syncSupabase()
  } catch (error) {
    console.error(`[ios-billing] failed to deliver transaction ${transaction.transactionId}`, error)
  }
}

export async function reconcileIosTransactions() {
  if (!isIos || !auth$.accessToken.peek()) {
    return
  }
  try {
    const transactions = await NoriBilling.getUnfinishedTransactions()
    for (const transaction of transactions) {
      await deliverInBackground(transaction)
    }
  } catch (error) {
    console.error('[ios-billing] failed to read unfinished transactions', error)
  }
}

export function listenIosTransactions() {
  if (!isIos) {
    return () => {}
  }
  const subscription = NoriBilling.addListener('onTransactionUpdated', (transaction) => {
    void deliverInBackground(transaction)
  })
  return () => subscription.remove()
}
