import { defineConfig } from 'wxt'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import reactNativeWeb from 'vite-plugin-react-native-web'

const extensionDir = process.cwd()
const rootDir = resolve(extensionDir, '..')
const rewriteRootAliases = {
  name: 'rewrite-nori-root-aliases',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.startsWith(rootDir) || id.startsWith(extensionDir)) return
    return code
      .replaceAll("'@/components/sheet/SettingsSheet'", "'nori-extension-settings'")
      .replaceAll('"@/components/sheet/SettingsSheet"', '"nori-extension-settings"')
      .replaceAll("'@/lib/open-bookmark'", "'nori-extension-open-bookmark'")
      .replaceAll('"@/lib/open-bookmark"', '"nori-extension-open-bookmark"')
      .replaceAll("'@/", "'nori-root/")
      .replaceAll('"@/', '"nori-root/')
  },
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // `nori` is a file: dependency, so packages get hoisted into the repo root's
  // node_modules, where they resolve the root copy of React instead of ours.
  // Two React instances mean every hook they call throws, so pin the imports.
  vite: () => ({
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: [
        {
          find: 'nori-extension-settings',
          replacement: resolve(extensionDir, 'components/SharedSettingsSheet.tsx'),
        },
        {
          find: 'nori-extension-open-bookmark',
          replacement: resolve(extensionDir, 'lib/open-bookmark.ts'),
        },
        { find: 'nori-root', replacement: rootDir },
        { find: /^react(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/react') },
        { find: /^react-dom(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/react-dom') },
      ],
    },
    plugins: [
      rewriteRootAliases,
      react({ jsxImportSource: 'nativewind' }),
      reactNativeWeb(),
    ],
  }),
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
      'http://*/*',
      'https://*/*',
      'https://pgukcvgypvjwtibzlvhr.supabase.co/*',
      'https://a.inks.page/*',
      'https://nori.inks.page/*',
      'https://github.com/nonbili/Nori/*',
    ],
    browser_specific_settings:
      browser === 'firefox'
        ? ({
            gecko: {
              id: 'browser-extension@nori.inks.page',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: ['personallyIdentifyingInfo', 'authenticationInfo', 'browsingActivity'],
              },
            },
          } as any)
        : undefined,
  }),
})
