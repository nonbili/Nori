import { browser } from 'wxt/browser'

export const languages = ['ar', 'el', 'en', 'es', 'fr', 'it', 'pl', 'pt_BR', 'sv', 'tr', 'zh_Hans', 'zh_Hant']

const isSupported = (value?: string | null) => Boolean(value && languages.includes(value))

// Browser UI languages are BCP 47 tags ('en-US', 'zh-Hant-TW'); map them onto the codes we ship.
export const resolveLanguageFromTag = (tag?: string | null): string | null => {
  if (!tag) return null
  const [language, ...rest] = tag.replace(/_/g, '-').split('-')
  const script = rest.find((part) => part.length === 4)
  const region = rest.find((part) => part.length === 2)?.toUpperCase()

  if (language === 'zh') {
    if (script === 'Hans' || script === 'Hant') return `zh_${script}`
    return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh_Hant' : 'zh_Hans'
  }
  if (language === 'pt') return region === 'BR' ? 'pt_BR' : null

  return isSupported(language) ? language : null
}

export const systemLanguage = (): string => resolveLanguageFromTag(browser.i18n.getUILanguage()) || 'en'

export const normalizeLanguage = (value?: string | null): string | null =>
  isSupported(value) ? (value as string) : null
