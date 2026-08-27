import { defineConfig } from 'wxt'
import { resolve } from 'node:path'
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
  react: {
    vite: { jsxImportSource: 'nativewind' },
  },
  // `nori` is a file: dependency, so packages get hoisted into the repo root's
  // node_modules, where they resolve the root copy of React instead of ours.
  // Two React instances mean every hook they call throws, so pin the imports.
  // i18next and Legend State also keep shared state in module scope, so their
  // core packages and adapters must resolve to the same physical instances.
  vite: () => ({
    resolve: {
      dedupe: ['react', 'react-dom', 'i18next', 'react-i18next', '@legendapp/state'],
      alias: [
        {
          find: 'nori-extension-settings',
          replacement: resolve(extensionDir, 'components/SharedSettingsSheet.tsx'),
        },
        {
          find: 'nori-extension-open-bookmark',
          replacement: resolve(extensionDir, 'lib/open-bookmark.ts'),
        },
        {
          find: '@legendapp/state/react',
          replacement: resolve(extensionDir, 'lib/legend-react.ts'),
        },
        { find: 'nori-root', replacement: rootDir },
        { find: /^react(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/react') },
        { find: /^react-dom(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/react-dom') },
        { find: /^i18next(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/i18next') },
        { find: /^react-i18next(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/react-i18next') },
        { find: /^@legendapp\/state(?=$|\/)/, replacement: resolve(process.cwd(), 'node_modules/@legendapp/state') },
      ],
    },
    plugins: [rewriteRootAliases, reactNativeWeb()],
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
    name: 'Nori',
    description: 'Beautiful bookmark manager and launcher',
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
