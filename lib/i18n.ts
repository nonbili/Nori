import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '../locales/ar.json'
import deText from '../locales/de.json'
import elText from '../locales/el.json'
import enText from '../locales/en.json'
import esText from '../locales/es.json'
import etText from '../locales/et.json'
import frText from '../locales/fr.json'
import huText from '../locales/hu.json'
import idText from '../locales/id.json'
import itText from '../locales/it.json'
import jaText from '../locales/ja.json'
import koText from '../locales/ko.json'
import lvText from '../locales/lv.json'
import plText from '../locales/pl.json'
import ptText from '../locales/pt.json'
import ptBRText from '../locales/pt_BR.json'
import ruText from '../locales/ru.json'
import svText from '../locales/sv.json'
import trText from '../locales/tr.json'
import ukText from '../locales/uk.json'
import viText from '../locales/vi.json'
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
  de: {
    translation: deText,
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
  et: {
    translation: etText,
  },
  fr: {
    translation: frText,
  },
  hu: {
    translation: huText,
  },
  id: {
    translation: idText,
  },
  it: {
    translation: itText,
  },
  ja: {
    translation: jaText,
  },
  ko: {
    translation: koText,
  },
  lv: {
    translation: lvText,
  },
  pl: {
    translation: plText,
  },
  pt: {
    translation: ptText,
  },
  pt_BR: {
    translation: ptBRText,
  },
  ru: {
    translation: ruText,
  },
  sv: {
    translation: svText,
  },
  tr: {
    translation: trText,
  },
  uk: {
    translation: ukText,
  },
  vi: {
    translation: viText,
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
