import { createRoot } from 'react-dom/client'
import i18n from 'i18next'
import { Call } from '@wailsio/runtime'
import { initDesktopBridge } from './wxt-shim'
import { installDesktopPageFetch } from './page-fetch'
import background from 'nori-extension/entrypoints/background'
import 'nori/lib/i18n'
import 'nori-extension/styles.css'
import 'nori-extension/components/app.css'
import './desktop.css'
import { NativeApp } from 'nori-extension/components/NativeApp'
import { setDesktopUpdateCheck } from 'nori/lib/desktop-updates'
import { setCloseToTraySupported } from 'nori/lib/close-to-tray'

// The extension's background script owns state, storage and Supabase sync. On
// desktop there is no separate worker context, so it runs here, in the same
// page as the UI, ahead of the first render.
await initDesktopBridge()
installDesktopPageFetch()
// The window is closed to a tray icon, which Go puts up and the settings sheet can turn off.
setCloseToTraySupported(true)
setDesktopUpdateCheck(() => Call.ByName('main.UpdateService.CheckNow').then(() => {}))
// The tray menu is drawn by Go, which has no translations of its own.
const sendTrayLabels = () =>
  // eslint-disable-next-line import/no-named-as-default-member
  void Call.ByName('main.TrayService.SetLabels', i18n.t('tray.show'), i18n.t('tray.quit')).catch(() => {})
i18n.on('languageChanged', sendTrayLabels)
sendTrayLabels()
background.main()

// `tab` is the extension's standalone-window mode, which is what a desktop
// window is: no popup chrome, no "open in tab" menu item.
createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <NativeApp mode="tab" />
  </div>,
)
