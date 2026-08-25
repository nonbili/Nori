import { defineConfig } from 'wxt'
import { resolve } from 'node:path'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  publicDir: '../assets/images',
  zip: {
    sourcesRoot: resolve(process.cwd(), '..'),
    includeSources: [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'tsconfig.json',
      'assets/images/**',
      'lib/**',
      'patches/**',
      'extension/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Nori – Bookmark Manager',
    description: 'Save, organize, search, and sync your Nori bookmarks.',
    version: '0.1.0',
    icons: { 16: 'icon.png', 32: 'icon.png', 48: 'icon.png', 128: 'icon.png' },
    permissions: ['storage', 'activeTab', 'identity', 'alarms'],
    host_permissions: [
      'https://pgukcvgypvjwtibzlvhr.supabase.co/*',
      'https://a.inks.page/*',
      'https://nori.inks.page/*',
      'https://github.com/nonbili/Nori/*',
    ],
    browser_specific_settings: browser === 'firefox'
      ? { gecko: {
          id: 'browser-extension@nori.inks.page',
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
            optional: ['personallyIdentifyingInfo', 'authenticationInfo', 'browsingActivity'],
          },
        } } as any
      : undefined,
  }),
})
