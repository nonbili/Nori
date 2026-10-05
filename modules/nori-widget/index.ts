import { requireOptionalNativeModule } from 'expo'

interface NoriWidgetModule {
  setData(json: string): Promise<void>
}

const NoriWidget = requireOptionalNativeModule<NoriWidgetModule>('NoriWidget')

export const isWidgetSupported = Boolean(NoriWidget)

/** Replaces the snapshot home screen widgets render from, and refreshes them. */
export async function setWidgetData(json: string) {
  await NoriWidget?.setData(json)
}
