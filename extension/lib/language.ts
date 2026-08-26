import { browser } from 'wxt/browser'
import { normalizeI18nLanguage, resolveI18nLanguage, supportedI18nLanguages } from 'nori/lib/language'

export const languages = supportedI18nLanguages

// Browser UI languages are BCP 47 tags ('en-US', 'zh-Hant-TW'); map them onto the codes we ship.
export const resolveLanguageFromTag = (tag?: string | null): string | null => {
  if (!tag) return null
  const [language, ...rest] = tag.replace(/_/g, '-').split('-')
  const script = rest.find((part) => part.length === 4)
  const region = rest.find((part) => part.length === 2)?.toUpperCase()

  return resolveI18nLanguage(language, script, region) || null
}

export const systemLanguage = (): string => resolveLanguageFromTag(browser.i18n.getUILanguage()) || 'en'

export const normalizeLanguage = (value?: string | null): string | null => normalizeI18nLanguage(value)
