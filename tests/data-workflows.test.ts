import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

// Each suite replaces host adapters. Isolate their module mocks from library tests.
for (const suite of ['sync', 'state-bridge', 'accounts', 'quick-share']) {
  test(`${suite} workflows`, async () => {
    const child = Bun.spawn([process.execPath, 'test', `./tests/${suite}.cases.${suite === 'state-bridge' ? 'tsx' : 'ts'}`], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    expect({ code, output: code === 0 ? '' : stdout + stderr }).toEqual({ code: 0, output: '' })
  }, 30000)
}
