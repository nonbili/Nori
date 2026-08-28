import { createRoot } from 'react-dom/client'
import { initDesktopBridge } from './wxt-shim'
import background from 'nori-extension/entrypoints/background'
import 'nori/lib/i18n'
import 'nori-extension/styles.css'
import 'nori-extension/components/app.css'
import './desktop.css'
import { NativeApp } from 'nori-extension/components/NativeApp'

// The extension's background script owns state, storage and Supabase sync. On
// desktop there is no separate worker context, so it runs here, in the same
// page as the UI, ahead of the first render.
await initDesktopBridge()
background.main()

// `tab` is the extension's standalone-window mode, which is what a desktop
// window is: no popup chrome, no "open in tab" menu item.
createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <NativeApp mode="tab" />
  </div>,
)
