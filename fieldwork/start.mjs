/** Run the native Fieldwork composition in a dedicated local state directory. */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
const child = spawn(process.execPath, ['--import', 'tsx/esm', join(root, 'apps/cli/src/bin.ts'), '--profile', 'web', '--patch', join(root, 'fieldwork/plugins/cordis.source.patch.yml'), ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? join(root, '.fieldwork/native'), DSH_TELEMETRY_DISABLED: '1' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
child.once('error', error => { console.error(error); process.exitCode = 1 })
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
