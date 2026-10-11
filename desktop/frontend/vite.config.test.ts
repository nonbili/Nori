import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { normalizePath } from 'vite'
import config from './vite.config'

type TransformPlugin = {
  name: string
  transform: (code: string, id: string) => string | undefined
}

const plugins = config.plugins as TransformPlugin[]
const rewrite = plugins.find((plugin) => plugin.name === 'rewrite-nori-root-aliases')!
const inject = plugins.find((plugin) => plugin.name === 'inject-define-background')!
const rootDir = resolve(import.meta.dirname, '../..')
// Use Vite IDs rather than OS-native paths, especially on the Windows runner.
const id = (path: string) => normalizePath(resolve(rootDir, path))

describe('desktop Vite transforms', () => {
  test('binds defineBackground before the extension background module runs', () => {
    const code = 'export default defineBackground(() => {})'
    const transformed = inject.transform(code, id('extension/entrypoints/background.ts'))!
    expect(transformed).toBe(
      `import { defineBackground } from ${JSON.stringify(id('desktop/frontend/src/wxt-shim'))}\n${code}`,
    )
    expect(inject.transform(code, id('desktop/frontend/src/main.tsx'))).toBeUndefined()
  })

  test('rewrites shared imports to the web implementations', () => {
    const code = [
      "import Settings from '@/components/sheet/SettingsSheet'",
      'import openBookmark from "@/lib/open-bookmark"',
      "import { value } from '@/lib/example'",
    ].join('\n')
    expect(rewrite.transform(code, id('components/example.tsx'))).toBe(
      [
        "import Settings from 'nori-extension-settings'",
        'import openBookmark from "nori-extension-open-bookmark"',
        "import { value } from 'nori-root/lib/example'",
      ].join('\n'),
    )
  })

  test('leaves desktop and extension imports alone', () => {
    const code = "import { value } from '@/lib/example'"
    expect(rewrite.transform(code, id('extension/components/example.tsx'))).toBeUndefined()
    expect(rewrite.transform(code, id('desktop/frontend/src/example.tsx'))).toBeUndefined()
  })
})
