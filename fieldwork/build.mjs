/** Build upstream artifacts first, then the native Fieldwork client bundle. */
import { spawnSync } from 'node:child_process'
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
for (const args of [['run', 'build'], ['--filter', '@fieldwork/ui', 'build']]) {
  const result = spawnSync(pnpm, args, { cwd: new URL('..', import.meta.url), stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
