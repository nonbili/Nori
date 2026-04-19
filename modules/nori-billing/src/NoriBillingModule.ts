import { NativeModule, requireNativeModule } from 'expo'
import { isIos } from '@/lib/utils'

export interface NoriBillingProduct {
  id: string
  title: string
  description: string
  displayPrice: string
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

declare class NoriBillingModule extends NativeModule {
  getProducts(productIds: string[]): Promise<NoriBillingProduct[]>
  purchase(productId: string, appAccountToken: string): Promise<NoriBillingEntitlement>
  restore(): Promise<NoriBillingEntitlement[]>
  getCurrentEntitlements(): Promise<NoriBillingEntitlement[]>
  manageSubscriptions(): Promise<void>
}

const unsupportedError = () => Promise.reject(new Error('In-app purchases are only available on iOS'))

const NoriBilling = isIos
  ? requireNativeModule<NoriBillingModule>('NoriBilling')
  : ({
      getProducts: unsupportedError,
      purchase: unsupportedError,
      restore: unsupportedError,
      getCurrentEntitlements: unsupportedError,
      manageSubscriptions: unsupportedError,
    } as unknown as NoriBillingModule)

export default NoriBilling
