import { SettingsSheet as ExtensionSettingsSheet } from './parts/SettingsSheet'

export function SettingsSheet({ onClose = () => undefined }: { onClose?: () => void }) {
  return <ExtensionSettingsSheet onClose={onClose} />
}
