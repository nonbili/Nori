import { fileURLToPath } from 'node:url'
import { localConfig } from '../tests/sync-local/protocol'

localConfig()
const child = Bun.spawn([process.execPath, 'test', '--timeout', '30000', './tests/sync-local/sync.cases.ts'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdin: 'inherit', stdout: 'inherit', stderr: 'inherit',
})
process.exit(await child.exited)
