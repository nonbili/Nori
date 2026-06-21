import { requireOptionalNativeModule } from 'expo'

export interface PendingQuickShareLink {
  id: string
  url: string
  targetListId: string
  createdAt: string
}

interface NoriQuickShareModule {
  configure(enabled: boolean, targetListId: string): Promise<void>
  getPendingLinks(): Promise<PendingQuickShareLink[]>
  removePendingLinkIds(ids: string[]): Promise<void>
  getPendingAppLinks(): Promise<PendingQuickShareLink[]>
  removePendingAppLinkIds(ids: string[]): Promise<void>
}

const NoriQuickShare = requireOptionalNativeModule<NoriQuickShareModule>('NoriQuickShare')

export async function configureQuickShare(enabled: boolean, targetListId: string) {
  await NoriQuickShare?.configure(enabled, targetListId)
}

export async function getPendingQuickShareLinks() {
  return (await NoriQuickShare?.getPendingLinks()) || []
}

export async function removePendingQuickShareLinkIds(ids: string[]) {
  if (ids.length === 0) {
    return
  }
  await NoriQuickShare?.removePendingLinkIds(ids)
}

export async function getPendingAppShareLinks() {
  return (await NoriQuickShare?.getPendingAppLinks()) || []
}

export async function removePendingAppShareLinkIds(ids: string[]) {
  if (ids.length === 0) {
    return
  }
  await NoriQuickShare?.removePendingAppLinkIds(ids)
}
