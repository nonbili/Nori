import { describe, expect, it } from 'bun:test'
import { normalizeI18nLanguage, resolveI18nLanguageFromExpoLocale, supportedI18nLanguages } from './i18n'

describe('i18n language resolution', () => {
  it('keeps the supported locale list in sync with app config expectations', () => {
    expect(supportedI18nLanguages).toEqual([
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
    ])
  })

  it('resolves supported base language codes', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'fr' } as any)).toBe('fr')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'ja' } as any)).toBeUndefined()
  })

  it('resolves Chinese by script before region fallback', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'TW' } as any)).toBe('zh_Hans')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', languageScriptCode: 'Hant', regionCode: 'CN' } as any)).toBe('zh_Hant')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', regionCode: 'TW' } as any)).toBe('zh_Hant')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', regionCode: 'US' } as any)).toBe('zh_Hans')
  })

  it('only resolves Portuguese for Brazil', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'pt', regionCode: 'BR' } as any)).toBe('pt_BR')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'pt', regionCode: 'PT' } as any)).toBeUndefined()
  })

  it('normalizes explicit language settings', () => {
    expect(normalizeI18nLanguage(null)).toBeNull()
    expect(normalizeI18nLanguage('en')).toBe('en')
    expect(normalizeI18nLanguage('ja')).toBeNull()
  })
})
