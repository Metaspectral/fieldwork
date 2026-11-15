/** Build upstream artifacts first, then the native Fieldwork client bundle. */
import { copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
for (const args of [['run', 'build'], ['--filter', '@fieldwork/ui', 'build']]) {
  const result = spawnSync(pnpm, args, { cwd: new URL('..', import.meta.url), stdio: 'inherit', env: { ...process.env, DSH_CLIENT_TITLE: 'Fieldwork' }, shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

for (const filename of ['favicon.svg', 'favicon-dark.svg']) copyFileSync(new URL('brand/mark.svg', import.meta.url), new URL('../apps/web/dist/' + filename, import.meta.url))
