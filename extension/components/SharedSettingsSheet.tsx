import { I18nextProvider } from 'react-i18next'
import settingsI18n from '../lib/i18n'
import { SettingsSheet as ExtensionSettingsSheet } from './parts/SettingsSheet'

export function SettingsSheet({ onClose = () => undefined }: { onClose?: () => void }) {
  return (
    <I18nextProvider i18n={settingsI18n}>
      <ExtensionSettingsSheet onClose={onClose} />
    </I18nextProvider>
  )
}
