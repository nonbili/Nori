import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { browser } from 'wxt/browser'
import { useApp } from '../AppContext'
import { Icon } from '../Icon'
import { Menu } from '../Menu'
import { Sheet } from '../Overlays'
import { SectionCard, Segmented, SettingRow, Toggle } from '../Rows'
import { showSnackbar } from 'nori-root/states/ui'
import { languageNativeNames } from 'nori/lib/language'
import { DONATE_LINKS, PLAN_URL, RELEASES_URL, REPO_URL } from 'nori/lib/product-links'
import { languages, systemLanguage } from '../../lib/language'
import { exportBookmarks, readImportFile, type TransferFormat } from '../../lib/transfer'
import type { Theme } from '../../lib/model'

const openTab = (url: string) => void browser.tabs.create({ url })

function SyncSection() {
  const { t } = useTranslation()
  const { snapshot, mutate } = useApp()
  const { auth, profile } = snapshot
  const busy = snapshot.syncing

  if (!auth.userId)
    return (
      <SectionCard title={t('settings.sync.label')}>
        <div className="px-5 py-5">
          <p className="m-0 text-sm leading-6 text-stone-600 dark:text-stone-400">{t('settings.sync.syncHint')}</p>
          <button className="primary-button mt-4" onClick={() => void mutate({ type: 'sign-in' })}>
            {t('settings.sync.signIn')}
          </button>
        </div>
      </SectionCard>
    )

  const planLabel = auth.plan === 'free' ? t('settings.plan.free') : t('settings.plan.sync')
  return (
    <>
      <SectionCard title={t('settings.sync.label')}>
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="account-avatar">{(auth.email || 'N').slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{auth.email || t('settings.sync.noriUser')}</div>
            <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {t('settings.sync.plan', { plan: planLabel })}
            </div>
          </div>
          <Menu
            className="round-action"
            label={t('settings.moreOptions')}
            trigger={<Icon name="more" size={17} />}
            items={[
              { label: t('settings.sync.syncNow'), icon: 'cloud', handler: () => void mutate({ type: 'sync' }) },
              { label: t('settings.plan.manage'), icon: 'external', handler: () => openTab(PLAN_URL) },
              { label: t('settings.sync.signOut'), handler: () => void mutate({ type: 'sign-out' }) },
            ]}
          />
        </div>
      </SectionCard>
      <SectionCard title={t('settings.plan.label')}>
        <div className="px-5 py-5">
          <span className="badge">{planLabel}</span>
          <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
            {auth.plan === 'free' ? t('settings.sync.upgradeHint') : t('settings.sync.syncHint')}
          </p>
          {profile.lastSyncAt ? (
            <p className="mt-2 text-xs text-stone-500">
              {t('settings.sync.lastSynced', { date: new Date(profile.lastSyncAt).toLocaleString() })}
            </p>
          ) : null}
          {busy ? <p className="mt-2 text-xs text-stone-500">{t('settings.sync.working')}</p> : null}
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
  const toLanguageLabel = (language: string) =>
    languageNativeNames[language as keyof typeof languageNativeNames] || language
  const currentLanguageLabel = preferences.language
    ? toLanguageLabel(preferences.language)
    : `${t('settings.experience.languageSystem')} (${toLanguageLabel(resolvedSystemLanguage)})`

  return (
    <SectionCard title={t('settings.experience.label')}>
      <SettingRow
        icon="image"
        title={t('settings.experience.showFavicon')}
        detail={t('settings.experience.showFaviconHint')}
        trailing={
          <Toggle
            label={t('settings.experience.showFavicon')}
            checked={preferences.showFavicons}
            onChange={() => setPreference({ showFavicons: !preferences.showFavicons })}
          />
        }
      />
      <SettingRow
        icon="translate"
        title={t('settings.experience.language')}
        detail={t('settings.experience.languageHint')}
        trailing={
          <Menu
            className="value-trigger"
            label={t('settings.experience.language')}
            trigger={
              <>
                <span>{currentLanguageLabel}</span>
                <Icon name="down" size={15} />
              </>
            }
            items={[
              {
                label: `${t('settings.experience.languageSystem')} (${toLanguageLabel(resolvedSystemLanguage)})`,
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
            <span className="block font-medium">{t('settings.experience.theme')}</span>
            <span className="mt-1 block text-sm leading-5 text-stone-600 dark:text-stone-400">
              {t('settings.experience.themeHint')}
            </span>
          </span>
        </div>
        <Segmented
          options={(['system', 'light', 'dark'] as Theme[]).map((theme) => ({
            label: t(`settings.experience.${theme}`),
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
      if (!result) throw new Error(t('settings.transfer.restoreInvalid'))
      const importedCount = Math.max(0, result.bookmarks.length - snapshot.profile.bookmarks.length)
      await mutate({ type: 'replace-data', lists: result.lists, bookmarks: result.bookmarks })
      showSnackbar(
        importedCount ? t('settings.transfer.imported', { count: importedCount }) : t('settings.transfer.importEmpty'),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('settings.transfer.restoreInvalid'))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <SectionCard title={t('settings.transfer.label')}>
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
        title={t('settings.transfer.import')}
        detail={busy === 'import' ? t('settings.transfer.importing') : t('settings.transfer.importHint')}
        onClick={() => fileRef.current?.click()}
      />
      <SettingRow
        icon="html"
        title={t('settings.transfer.exportHtml')}
        detail={busy === 'html' ? t('settings.transfer.exporting') : t('settings.transfer.exportHtmlHint')}
        onClick={() => runExport('html')}
      />
      <SettingRow
        icon="text"
        title={t('settings.transfer.exportPlain')}
        detail={busy === 'plain' ? t('settings.transfer.exporting') : t('settings.transfer.exportPlainHint')}
        onClick={() => runExport('plain')}
      />
      <SettingRow
        icon="backup"
        title={t('settings.transfer.exportBackup')}
        detail={busy === 'json' ? t('settings.transfer.exporting') : t('settings.transfer.exportBackupHint')}
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
        <SettingRow icon="info" title={t('settings.about.version')} detail={`v${version}`} />
        <SettingRow
          icon="history"
          title={t('settings.changelog.label')}
          detail={t('settings.changelog.hint')}
          onClick={() => openTab(RELEASES_URL)}
          last
        />
      </div>
      <p className="px-1 text-sm leading-6 text-stone-600 dark:text-stone-400">
        {t('settings.about.extensionPrivacy')}
      </p>
      <SectionCard title={t('settings.about.code')}>
        <SettingRow
          icon="code"
          title="GitHub"
          detail="github.com/nonbili/Nori"
          onClick={() => openTab(REPO_URL)}
          last
        />
      </SectionCard>
      <SectionCard title={t('settings.about.donate')}>
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
      title={page === 'about' ? t('settings.about.label') : t('settings.title')}
      onClose={page === 'home' ? onClose : () => setPage('home')}
      showCloseButton={page === 'home'}
      headerLeft={
        page === 'home' ? undefined : (
          <button className="round-action" onClick={() => setPage('home')} aria-label={t('common.back')}>
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
            <SectionCard title={t('settings.about.label')}>
              <SettingRow
                icon="info"
                title={t('settings.about.label')}
                detail={`v${version}`}
                onClick={() => setPage('about')}
                last
              />
            </SectionCard>
          </>
        )}
      </div>
    </Sheet>
  )
}
