import { describe, expect, it } from 'bun:test'
import { normalizeI18nLanguage, resolveI18nLanguageFromExpoLocale, supportedI18nLanguages } from './i18n'

describe('i18n language resolution', () => {
  it('keeps the supported locale list in sync with app config expectations', () => {
    expect(supportedI18nLanguages).toEqual([
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
    ])
  })

  it('resolves supported base language codes', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'fr' } as any)).toBe('fr')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'de' } as any)).toBe('de')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'ja' } as any)).toBe('ja')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'jp' } as any)).toBe('ja')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'fi' } as any)).toBeUndefined()
  })

  it('resolves Chinese by script before region fallback', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'TW' } as any)).toBe('zh_Hans')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', languageScriptCode: 'Hant', regionCode: 'CN' } as any)).toBe('zh_Hant')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', regionCode: 'TW' } as any)).toBe('zh_Hant')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'zh', regionCode: 'US' } as any)).toBe('zh_Hans')
  })

  it('resolves Portuguese for Brazil and Portugal', () => {
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'pt', regionCode: 'BR' } as any)).toBe('pt_BR')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'pt', regionCode: 'PT' } as any)).toBe('pt')
    expect(resolveI18nLanguageFromExpoLocale({ languageCode: 'pt' } as any)).toBe('pt')
  })

  it('normalizes explicit language settings', () => {
    expect(normalizeI18nLanguage(null)).toBeNull()
    expect(normalizeI18nLanguage('en')).toBe('en')
    expect(normalizeI18nLanguage('de')).toBe('de')
    expect(normalizeI18nLanguage('ja')).toBe('ja')
    expect(normalizeI18nLanguage('jp')).toBe('ja')
    expect(normalizeI18nLanguage('fi')).toBeNull()
  })
})


describe('appearance translations', () => {
  it('includes typography labels and the AMOLED hint in every supported locale', async () => {
    const keys = ['amoled', 'fontSize', 'fontFamily', 'fontSystem', 'fontSerif', 'fontMonospace',
      'fontPreview', 'fontReset', 'fontDecrease', 'fontIncrease']
    for (const language of supportedI18nLanguages) {
      const locale = await Bun.file(new URL(`../locales/${language}.json`, import.meta.url)).json()
      const experience = locale.settings.experience
      for (const key of keys) {
        expect(typeof experience[key]).toBe('string')
        expect(experience[key].trim().length).toBeGreaterThan(0)
      }
      expect(experience.themeHint).toContain('AMOLED')
    }
  })
})
