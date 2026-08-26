import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../lib/i18n'
import '../../styles.css'
import '../../components/app.css'
import './tab.css'
import { App } from '../../components/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App mode="tab" />
  </StrictMode>,
)
