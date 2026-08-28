import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactNativeWeb from 'vite-plugin-react-native-web'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const frontendDir = import.meta.dirname
const desktopDir = resolve(frontendDir, '..')
const rootDir = resolve(desktopDir, '..')
const extensionDir = resolve(rootDir, 'extension')
// Packages that keep state in module scope must resolve to exactly one copy.
// Depending on how the workspace install hoists, that copy lives either here or
// in the repo root.
const pinned = (name: string) => {
  const local = resolve(frontendDir, 'node_modules', name)
  return existsSync(local) ? local : resolve(rootDir, 'node_modules', name)
}

// The desktop app is versioned independently of the mobile app's package.json.
// version.txt is the same file the Go side embeds and the release workflow
// checks the pushed tag against.
const version = readFileSync(resolve(desktopDir, 'version.txt'), 'utf8').trim()

// Mirrors the extension's wxt.config.ts: the React Native app under the repo
// root imports through the `@/` alias, and two of those modules have web
// specific replacements.
const rewriteRootAliases = {
  name: 'rewrite-nori-root-aliases',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.startsWith(rootDir) || id.startsWith(extensionDir) || id.startsWith(desktopDir)) return
    return code
      .replaceAll("'@/components/sheet/SettingsSheet'", "'nori-extension-settings'")
      .replaceAll('"@/components/sheet/SettingsSheet"', '"nori-extension-settings"')
      .replaceAll("'@/lib/open-bookmark'", "'nori-extension-open-bookmark'")
      .replaceAll('"@/lib/open-bookmark"', '"nori-extension-open-bookmark"')
      .replaceAll("'@/", "'nori-root/")
      .replaceAll('"@/', '"nori-root/')
  },
}

// The extension's background entrypoint is written against wxt's auto-imported
// `defineBackground`. Inject the desktop shim instead of running a bundler
// wide auto-import.
const injectDefineBackground = {
  name: 'inject-define-background',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.startsWith(resolve(extensionDir, 'entrypoints'))) return
    if (!code.includes('defineBackground')) return
    return `import { defineBackground } from ${JSON.stringify(resolve(frontendDir, 'src/wxt-shim'))}\n${code}`
  },
}

export default defineConfig({
  root: frontendDir,
  plugins: [rewriteRootAliases, injectDefineBackground, react({ jsxImportSource: 'nativewind' }), reactNativeWeb()],
  define: {
    // wxt build flags the shared extension code branches on.
    'import.meta.env.FIREFOX': 'false',
    'import.meta.env.CHROME': 'false',
    __NORI_VERSION__: JSON.stringify(version),
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'i18next', 'react-i18next', '@legendapp/state'],
    alias: [
      // Every `browser.*` call in the shared extension code lands on the
      // desktop shim, which is backed by the Wails services.
      { find: 'wxt/browser', replacement: resolve(frontendDir, 'src/wxt-shim.ts') },
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
      { find: 'nori-extension', replacement: extensionDir },
      { find: 'nori-root', replacement: rootDir },
      { find: /^nori\//, replacement: `${rootDir}/` },
      // rewriteRootAliases is a transform plugin, which Vite's esbuild dependency
      // scanner does not run, so in dev the scanner sees the raw `@/` specifiers.
      // Resolving them keeps pre-bundling working; real modules are rewritten to
      // `nori-root/` above before they ever reach this entry.
      { find: /^@\//, replacement: `${rootDir}/` },
      { find: /^react(?=$|\/)/, replacement: pinned('react') },
      { find: /^react-dom(?=$|\/)/, replacement: pinned('react-dom') },
      { find: /^i18next(?=$|\/)/, replacement: pinned('i18next') },
      { find: /^react-i18next(?=$|\/)/, replacement: pinned('react-i18next') },
      { find: /^@legendapp\/state(?=$|\/)/, replacement: pinned('@legendapp/state') },
    ],
  },
  publicDir: resolve(rootDir, 'assets/images'),
  build: {
    target: 'esnext',
    outDir: resolve(frontendDir, 'dist'),
    emptyOutDir: true,
  },
})
