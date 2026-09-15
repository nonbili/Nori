import { defineConfig } from 'wxt'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import reactNativeWeb from 'vite-plugin-react-native-web'

const extensionDir = process.cwd()
const rootDir = resolve(extensionDir, '..')
// Resolve from the extension so a nested copy wins, but fall back to the
// hoisted root copy that a clean install (CI, AMO source review) produces.
const requireFromExtension = createRequire(resolve(extensionDir, 'package.json'))
const packageDir = (name: string) => dirname(requireFromExtension.resolve(`${name}/package.json`))
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
        { find: /^react(?=$|\/)/, replacement: packageDir('react') },
        { find: /^react-dom(?=$|\/)/, replacement: packageDir('react-dom') },
        { find: /^i18next(?=$|\/)/, replacement: packageDir('i18next') },
        { find: /^react-i18next(?=$|\/)/, replacement: packageDir('react-i18next') },
        { find: /^@legendapp\/state(?=$|\/)/, replacement: packageDir('@legendapp/state') },
      ],
    },
    plugins: [rewriteRootAliases, reactNativeWeb()],
  }),
  publicDir: '../assets/images',
  // AMO reviewers must be able to rebuild the submission from the sources zip,
  // so it carries every root directory the extension imports plus the
  // workspace manifests `bun install` needs to honor bun.lock.
  zip: {
    sourcesRoot: resolve(process.cwd(), '..'),
    includeSources: [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'tsconfig.json',
      'tailwind.config.js',
      'env.d.ts',
      'desktop/frontend/package.json',
      'assets/images/**',
      'components/**',
      'lib/**',
      'locales/**',
      'modules/**',
      'patches/**',
      'states/**',
      'extension/**',
    ],
  },
  manifest: ({ browser }) => ({
    name: 'Nori',
    description: 'Beautiful bookmark manager and launcher',
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
