import { NativeModule, requireNativeModule } from 'expo'
import { isIos } from '@/lib/utils'

export interface NoriBillingProduct {
  id: string
  title: string
  description: string
  displayPrice: string
  /* Localized length of one billing period, e.g. "1 month"; null for non-subscriptions. */
  subscriptionPeriod: string | null
}

export interface NoriBillingEntitlement {
  transactionId: string
  originalTransactionId: string
  productId: string
  purchaseDate: string
  expirationDate: string | null
  revocationDate: string | null
  appAccountToken: string | null
  environment: string | null
  signedTransactionInfo: string
}

type NoriBillingEvents = {
  onTransactionUpdated: (transaction: NoriBillingEntitlement) => void
}

declare class NoriBillingModule extends NativeModule<NoriBillingEvents> {
  /* `locale` (BCP 47) is the language subscriptionPeriod is written in; null follows the device. */
  getProducts(productIds: string[], locale: string | null): Promise<NoriBillingProduct[]>
  /* Resolves with an unfinished transaction; call finishTransaction once the backend has it. */
  purchase(productId: string, appAccountToken: string): Promise<NoriBillingEntitlement>
  restore(): Promise<NoriBillingEntitlement[]>
  getUnfinishedTransactions(): Promise<NoriBillingEntitlement[]>
  finishTransaction(transactionId: string): Promise<void>
  manageSubscriptions(): Promise<void>
}

const unsupportedError = () => Promise.reject(new Error('In-app purchases are only available on iOS'))

const NoriBilling = isIos
  ? requireNativeModule<NoriBillingModule>('NoriBilling')
  : ({
      getProducts: unsupportedError,
      purchase: unsupportedError,
      restore: unsupportedError,
      getUnfinishedTransactions: unsupportedError,
      finishTransaction: unsupportedError,
      manageSubscriptions: unsupportedError,
      addListener: () => ({ remove: () => {} }),
    } as unknown as NoriBillingModule)

export default NoriBilling
