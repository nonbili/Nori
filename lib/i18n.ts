import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '../locales/ar.json'
import elText from '../locales/el.json'
import enText from '../locales/en.json'
import esText from '../locales/es.json'
import frText from '../locales/fr.json'
import itText from '../locales/it.json'
import plText from '../locales/pl.json'
import ptBRText from '../locales/pt_BR.json'
import svText from '../locales/sv.json'
import trText from '../locales/tr.json'
import zhHansText from '../locales/zh_Hans.json'
import zhHantText from '../locales/zh_Hant.json'
import type { Locale } from 'expo-localization'
import {
  normalizeI18nLanguage,
  resolveI18nLanguage,
  supportedI18nLanguages,
  type SupportedI18nLanguage,
} from './language'
export { normalizeI18nLanguage, supportedI18nLanguages, type SupportedI18nLanguage } from './language'

const resources: Record<SupportedI18nLanguage, { translation: any }> = {
  ar: {
    translation: arText,
  },
  el: {
    translation: elText,
  },
  en: {
    translation: enText,
  },
  es: {
    translation: esText,
  },
  fr: {
    translation: frText,
  },
  it: {
    translation: itText,
  },
  pl: {
    translation: plText,
  },
  pt_BR: {
    translation: ptBRText,
  },
  sv: {
    translation: svText,
  },
  tr: {
    translation: trText,
  },
  zh_Hans: {
    translation: zhHansText,
  },
  zh_Hant: {
    translation: zhHantText,
  },
}

export const resolveI18nLanguageFromExpoLocale = (locale?: Locale): SupportedI18nLanguage | undefined => {
  return resolveI18nLanguage(locale?.languageCode, locale?.languageScriptCode, locale?.regionCode)
}

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  supportedLngs: Object.keys(resources),
  resources,
})
