import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

// Native view and persistence adapters are replaced in the component suite.
// Keep those module mocks and the DOM out of the shared library test process.
test('preview component workflows', async () => {
  const child = Bun.spawn([process.execPath, 'test', './tests/preview-workflows.cases.tsx'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, output: code === 0 ? '' : stdout + stderr }).toEqual({ code: 0, output: '' })
}, 30000)
