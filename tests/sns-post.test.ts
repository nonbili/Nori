import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('SNS post rendering workflows', async () => {
  const child = Bun.spawn([process.execPath, 'test', './tests/sns-post.cases.tsx'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'pipe', stderr: 'pipe',
  })
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, output: code === 0 ? '' : out + err }).toEqual({ code: 0, output: '' })
}, 30000)
