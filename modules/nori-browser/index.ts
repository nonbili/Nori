import { requireOptionalNativeModule } from 'expo'

interface NoriBrowserModule {
  openTab(url: string): void
}

const NoriBrowser = requireOptionalNativeModule<NoriBrowserModule>('NoriBrowser')

export function openTab(url: string): boolean {
  if (!NoriBrowser) {
    return false
  }

  NoriBrowser.openTab(url)
  return true
}
