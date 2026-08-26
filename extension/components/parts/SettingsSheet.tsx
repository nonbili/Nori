import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import { useApp } from '../AppContext'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { Sheet } from '../Overlays'
import { SectionCard, Segmented, SettingRow, Toggle } from '../Rows'
import { showSnackbar } from '../Snackbar'
import { languages, systemLanguage } from '../../lib/language'
import { exportBookmarks, readImportFile, type TransferFormat } from '../../lib/transfer'
import type { Theme } from '../../lib/model'

const REPO_URL = 'https://github.com/nonbili/Nori'
const RELEASES_URL = 'https://github.com/nonbili/Nori/releases'
const PLAN_URL = 'https://nori.inks.page/app'
const DONATE_LINKS = [
  { label: 'GitHub Sponsors', detail: 'github.com/sponsors/rnons', url: 'https://github.com/sponsors/rnons' },
  { label: 'Liberapay', detail: 'liberapay.com/rnons', url: 'https://liberapay.com/rnons' },
  { label: 'PayPal', detail: 'paypal.me/rnons', url: 'https://paypal.me/rnons' },
]

const languageNames: Record<string, string> = {
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

const openTab = (url: string) => void browser.tabs.create({ url })

function SyncSection() {
  const { t } = useTranslation()
  const { snapshot, mutate } = useApp()
  const { auth, profile } = snapshot
  const busy = snapshot.syncing

  if (!auth.userId)
    return (
      <SectionCard title={t('syncLabel')}>
        <div className="px-5 py-5">
          <p className="m-0 text-sm leading-6 text-stone-600 dark:text-stone-400">{t('syncHint')}</p>
          <button className="primary-button mt-4" onClick={() => void mutate({ type: 'sign-in' })}>
            {t('signIn')}
          </button>
        </div>
      </SectionCard>
    )

  const planLabel = auth.plan === 'free' ? t('planFree') : t('planSync')
  return (
    <>
      <SectionCard title={t('syncLabel')}>
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="account-avatar">{(auth.email || 'N').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{auth.email || t('noriUser')}</div>
            <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('plan', { plan: planLabel })}</div>
          </div>
          <Menu
            className="round-action"
            label={t('moreOptions')}
            trigger={<Icon name="more" size={17} />}
            items={[
              { label: t('sync'), icon: 'cloud', handler: () => void mutate({ type: 'sync' }) },
              { label: t('managePlan'), icon: 'external', handler: () => openTab(PLAN_URL) },
              { label: t('signOut'), handler: () => void mutate({ type: 'sign-out' }) },
            ]}
          />
        </div>
      </SectionCard>
      <SectionCard title={t('planLabel')}>
        <div className="px-5 py-5">
          <span className="badge">{planLabel}</span>
          <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
            {auth.plan === 'free' ? t('upgradeHint') : t('syncHint')}
          </p>
          {profile.lastSyncAt ? (
            <p className="mt-2 text-xs text-stone-500">
              {t('lastSync', { date: new Date(profile.lastSyncAt).toLocaleString() })}
            </p>
          ) : null}
          {busy ? <p className="mt-2 text-xs text-stone-500">{t('syncing')}</p> : null}
          {snapshot.syncError ? (
            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{snapshot.syncError}</p>
          ) : null}
        </div>
      </SectionCard>
    </>
  )
}

function ExperienceSection() {
  const { t } = useTranslation()
  const { snapshot, mutate } = useApp()
  const { preferences } = snapshot
  const setPreference = (patch: Partial<typeof preferences>) =>
    void mutate({ type: 'set-preferences', preferences: patch })
  const resolvedSystemLanguage = systemLanguage()
  const toLanguageLabel = (language: string) => languageNames[language] || language
  const currentLanguageLabel = preferences.language
    ? toLanguageLabel(preferences.language)
    : `${t('languageSystem')} (${toLanguageLabel(resolvedSystemLanguage)})`

  return (
    <SectionCard title={t('experienceLabel')}>
      <SettingRow
        icon="image"
        title={t('showFavicons')}
        detail={t('showFaviconsHint')}
        trailing={
          <Toggle
            label={t('showFavicons')}
            checked={preferences.showFavicons}
            onChange={() => setPreference({ showFavicons: !preferences.showFavicons })}
          />
        }
      />
      <SettingRow
        icon="translate"
        title={t('language')}
        detail={t('languageHint')}
        trailing={
          <Menu
            className="value-trigger"
            label={t('language')}
            trigger={
              <>
                <span>{currentLanguageLabel}</span>
                <Icon name="down" size={15} />
              </>
            }
            items={[
              {
                label: `${t('languageSystem')} (${toLanguageLabel(resolvedSystemLanguage)})`,
                selected: preferences.language === null,
                handler: () => setPreference({ language: null }),
              },
              ...languages.map((language) => ({
                label: toLanguageLabel(language),
                selected: preferences.language === language,
                handler: () => setPreference({ language }),
              })),
            ]}
          />
        }
      />
      <div className="setting-row column">
        <div className="flex items-center gap-3">
          <span className="setting-icon">
            <Icon name="palette" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t('theme')}</span>
            <span className="mt-1 block text-sm leading-5 text-stone-600 dark:text-stone-400">{t('themeHint')}</span>
          </span>
        </div>
        <Segmented
          options={(['system', 'light', 'dark'] as Theme[]).map((theme) => ({
            label: t(theme),
            active: preferences.theme === theme,
            onClick: () => setPreference({ theme }),
          }))}
        />
      </div>
    </SectionCard>
  )
}

function TransferSection() {
  const { t } = useTranslation()
  const { snapshot, mutate, setError } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'import' | TransferFormat>()

  const runExport = (format: TransferFormat) => {
    setBusy(format)
    exportBookmarks(format, snapshot.profile.lists, snapshot.profile.bookmarks)
    setBusy(undefined)
  }

  const runImport = async (file: File) => {
    setBusy('import')
    try {
      const result = await readImportFile(file, snapshot.profile.lists, snapshot.profile.bookmarks)
      if (!result) throw new Error(t('invalidFile'))
      await mutate({ type: 'replace-data', lists: result.lists, bookmarks: result.bookmarks })
      showSnackbar(t('imported'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('invalidFile'))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <SectionCard title={t('transferLabel')}>
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept=".json,.html,.htm,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void runImport(file)
          event.target.value = ''
        }}
      />
      <SettingRow
        icon="upload"
        title={t('import')}
        detail={busy === 'import' ? t('importing') : t('importHint')}
        onClick={() => fileRef.current?.click()}
      />
      <SettingRow
        icon="html"
        title={t('exportHtml')}
        detail={busy === 'html' ? t('exporting') : t('exportHtmlHint')}
        onClick={() => runExport('html')}
      />
      <SettingRow
        icon="text"
        title={t('exportPlain')}
        detail={busy === 'plain' ? t('exporting') : t('exportPlainHint')}
        onClick={() => runExport('plain')}
      />
      <SettingRow
        icon="backup"
        title={t('exportBackup')}
        detail={busy === 'json' ? t('exporting') : t('exportBackupHint')}
        onClick={() => runExport('json')}
        last
      />
    </SectionCard>
  )
}

function AboutPage({ version }: { version: string }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="section-body">
        <SettingRow icon="info" title={t('version')} detail={`v${version}`} />
        <SettingRow
          icon="history"
          title={t('changelog')}
          detail={t('changelogHint')}
          onClick={() => openTab(RELEASES_URL)}
          last
        />
      </div>
      <p className="px-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{t('privacy')}</p>
      <SectionCard title={t('code')}>
        <SettingRow
          icon="code"
          title="GitHub"
          detail="github.com/nonbili/Nori"
          onClick={() => openTab(REPO_URL)}
          last
        />
      </SectionCard>
      <SectionCard title={t('donate')}>
        {DONATE_LINKS.map((item, index) => (
          <SettingRow
            key={item.url}
            icon="heart"
            title={item.label}
            detail={item.detail}
            onClick={() => openTab(item.url)}
            last={index === DONATE_LINKS.length - 1}
          />
        ))}
      </SectionCard>
    </>
  )
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState<'home' | 'about'>('home')
  const version = browser.runtime.getManifest().version
  const scrollRef = useRef<HTMLDivElement>(null)

  // Each page starts at the top, the way the Android settings sheet does.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [page])

  return (
    <Sheet
      title={page === 'about' ? t('about') : t('settings')}
      onClose={page === 'home' ? onClose : () => setPage('home')}
      showCloseButton={page === 'home'}
      headerLeft={
        page === 'home' ? undefined : (
          <button className="round-action" onClick={() => setPage('home')} aria-label={t('back')}>
            <Icon name="back" size={18} />
          </button>
        )
      }
    >
      <div ref={scrollRef} className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 pb-4">
        {page === 'about' ? (
          <AboutPage version={version} />
        ) : (
          <>
            <SyncSection />
            <ExperienceSection />
            <TransferSection />
            <SectionCard title={t('aboutLabel')}>
              <SettingRow icon="info" title={t('about')} detail={`v${version}`} onClick={() => setPage('about')} last />
            </SectionCard>
          </>
        )}
      </div>
    </Sheet>
  )
}
