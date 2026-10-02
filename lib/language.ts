export const supportedI18nLanguages = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lv',
  'pl',
  'pt',
  'pt_BR',
  'ru',
  'sv',
  'tr',
  'uk',
  'vi',
  'zh_Hans',
  'zh_Hant',
] as const

export type SupportedI18nLanguage = (typeof supportedI18nLanguages)[number]

export const languageNativeNames: Record<SupportedI18nLanguage, string> = {
  ar: 'العربية',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  et: 'Eesti',
  fr: 'Français',
  hu: 'Magyar',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  lv: 'Latviešu',
  pl: 'Polski',
  pt: 'Português',
  pt_BR: 'Português (Brasil)',
  ru: 'Русский',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  zh_Hans: '简体中文',
  zh_Hant: '繁體中文',
}

const isSupportedLanguage = (value?: string | null): value is SupportedI18nLanguage =>
  Boolean(value && supportedI18nLanguages.includes(value as SupportedI18nLanguage))

export function resolveI18nLanguage(
  language?: string | null,
  script?: string | null,
  region?: string | null,
): SupportedI18nLanguage | undefined {
  if (!language) return undefined
  if (language === 'jp') return 'ja'
  if (language === 'zh') {
    if (script === 'Hans' || script === 'Hant') return `zh_${script}`
    const normalizedRegion = region?.toUpperCase()
    return normalizedRegion === 'TW' || normalizedRegion === 'HK' || normalizedRegion === 'MO' ? 'zh_Hant' : 'zh_Hans'
  }
  if (language === 'pt') return region?.toUpperCase() === 'BR' ? 'pt_BR' : 'pt'
  return isSupportedLanguage(language) ? language : undefined
}

export const normalizeI18nLanguage = (value?: string | null): SupportedI18nLanguage | null => {
  if (value == null) return null
  if (value === 'jp') return 'ja'
  return isSupportedLanguage(value) ? value : null
}
