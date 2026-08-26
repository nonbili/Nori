export const supportedI18nLanguages = [
  'ar',
  'el',
  'en',
  'es',
  'fr',
  'it',
  'pl',
  'pt_BR',
  'sv',
  'tr',
  'zh_Hans',
  'zh_Hant',
] as const

export type SupportedI18nLanguage = (typeof supportedI18nLanguages)[number]

export const languageNativeNames: Record<SupportedI18nLanguage, string> = {
  ar: 'العربية',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pl: 'Polski',
  pt_BR: 'Português (Brasil)',
  sv: 'Svenska',
  tr: 'Türkçe',
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
  if (language === 'zh') {
    if (script === 'Hans' || script === 'Hant') return `zh_${script}`
    const normalizedRegion = region?.toUpperCase()
    return normalizedRegion === 'TW' || normalizedRegion === 'HK' || normalizedRegion === 'MO' ? 'zh_Hant' : 'zh_Hans'
  }
  if (language === 'pt') return region?.toUpperCase() === 'BR' ? 'pt_BR' : undefined
  return isSupportedLanguage(language) ? language : undefined
}

export const normalizeI18nLanguage = (value?: string | null): SupportedI18nLanguage | null =>
  value == null ? null : isSupportedLanguage(value) ? value : null
