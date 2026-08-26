import { createRoot } from 'react-dom/client'
import 'nori/lib/i18n'
import '../../styles.css'
import '../../components/app.css'
import './popup.css'
import { NativeApp } from '../../components/NativeApp'

createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <NativeApp mode="popup" />
  </div>,
)
