import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enText from '@/locales/en.json'

const resources = {
  en: {
    translation: enText,
  },
}

i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  supportedLngs: Object.keys(resources),
  resources,
})
