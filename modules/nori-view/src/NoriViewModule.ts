import { requireOptionalNativeModule } from 'expo'

export interface BlocklistPayload {
  enabled: boolean
  blockedHosts: string
  allowedHosts: string
  revision: number
}

interface NoriViewModule {
  /** Resolves once the list is in place, so a reload issued afterwards loads with it. */
  setBlocklist(payload: BlocklistPayload): Promise<void>
}

export default requireOptionalNativeModule<NoriViewModule>('NoriView')
