/** Real Harness Loader and native approval/executor integration; no model API call. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
test('independent native plugins execute through approval and preserve the baseline', { timeout: 90000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'native-fieldwork-'))
  const overlay = join(home, 'fixture.yml')
  await writeFile(overlay, `- insert:\n    - id: fieldwork-composition-test\n      name: ${JSON.stringify(join(root, 'fieldwork/plugins/composition-fixture.mjs'))}\n`)
  const server = fork(join(root, 'apps/cli/src/bin.ts'), ['--profile', 'web', '--patch', 'fieldwork/plugins/cordis.source.patch.yml', '--patch', overlay, '--no-open', '--port', '0'], { cwd: root, execArgv: ['--import', 'tsx/esm'], env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, silent: true })
  const exited = new Promise(resolve => server.once('exit', resolve))
  let output = ''
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Native composition timed out')), 60000)
      let sent = false
      const ready = chunk => { output += chunk.toString(); if (!sent && output.includes('dsh web: ')) { sent = true; server.send('exercise-fieldwork') } }
      server.stdout.on('data', ready); server.stderr.on('data', ready)
      server.on('message', message => { clearTimeout(timeout); if (message.error) reject(new Error(message.error + '\n' + output.replace(/https?:\/\/[^\s]+/g, '[URL omitted]'))); else resolve(message.result) })
      server.once('exit', () => { clearTimeout(timeout); reject(new Error('Native composition exited before assertions')) })
    })
    for (const name of ['read_my_farm', 'update_my_farm', 'browse_farm_knowledge', 'plan_crop_trial', 'compare_seed_quotes', 'publish_farm_summary']) assert.ok(result.names.includes(name), name)
    assert.ok(!result.names.includes('bash'), 'Fieldwork preset must not expose a general shell')
    assert.equal(result.denied.isError, true)
    assert.equal(result.denied.error.info.code, 'APPROVAL_REJECTED')
    assert.deepEqual(result.before, result.afterDenied)
    assert.equal(result.deniedCorrection.isError, true)
    assert.equal(result.deniedCorrection.error.info.code, 'APPROVAL_REJECTED')
    assert.equal(result.correction.isError, false)
    assert.equal(result.deniedSource.error.info.code, 'APPROVAL_REJECTED')
    assert.equal(result.deniedCorn.error.info.code, 'APPROVAL_REJECTED')
    assert.equal(result.acceptedCorn.plan.status, 'accepted')
    assert.equal(result.corn.calculation.additionalPurchaseCost, 300)
    assert.equal(result.final.cornPlans[0].observations.length, 1)
    assert.equal(result.sharedResearch.fields[0].years['2022'].crop, 'corn')
    assert.equal(result.sharedResearch.fields[0].evidence, 'demo')
    assert.match(result.evidence.sections[0].text, /32000/)
    assert.equal(result.evidence.sections[0].locator, 'block 1')
    assert.equal(result.comparison.savingCad, 216)
    assert.ok(!JSON.stringify(result.preview).includes('Private exact'))
    assert.equal(result.published.source, result.preview.summary.source)
    assert.equal(result.final.trials.length, 2)
    assert.equal(result.final.summaries.length, 2)
    assert.deepEqual(result.final.farm, result.before.farm)
    assert.equal(result.invalid.isError, true)
    assert.ok(result.approvalCount >= 7)
  } finally {
    server.kill('SIGTERM')
    const kill = setTimeout(() => server.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(kill)
    await rm(home, { recursive: true, force: true })
  }
})
