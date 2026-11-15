/** Trust guideline through the real Harness Loader, native approvals, and the native executor; no model API call. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
test('the trust guideline never blocks a request and volunteers more only as the farmer engages', { timeout: 90000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'native-trust-'))
  const overlay = join(home, 'fixture.yml')
  await writeFile(overlay, `- insert:\n    - id: fieldwork-trust-composition-test\n      name: ${JSON.stringify(join(root, 'fieldwork/plugins/trust-composition-fixture.mjs'))}\n`)
  const server = fork(join(root, 'apps/cli/src/bin.ts'), ['--profile', 'web', '--patch', 'fieldwork/plugins/cordis.source.patch.yml', '--patch', overlay, '--no-open', '--port', '0'], { cwd: root, execArgv: ['--import', 'tsx/esm'], env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, silent: true })
  const exited = new Promise(resolve => server.once('exit', resolve))
  let output = ''
  try {
    const r = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Trust composition timed out')), 60000)
      let sent = false
      const ready = chunk => { output += chunk.toString(); if (!sent && output.includes('dsh web: ')) { sent = true; server.send('exercise-trust') } }
      server.stdout.on('data', ready); server.stderr.on('data', ready)
      server.on('message', message => { clearTimeout(timeout); if (message.error) reject(new Error(message.error + '\n' + output.replace(/https?:\/\/[^\s]+/g, '[URL omitted]'))); else resolve(message.result) })
      server.once('exit', () => { clearTimeout(timeout); reject(new Error('Trust composition exited before assertions')) })
    })
    for (const name of ['risk_check', 'show_source', 'agronomist_packet', 'trust_status', 'trust_note', 'trust_set_pace', 'save_estimate', 'check_estimate', 'trust_forget', 'field_risks', 'plan_crop_trial']) assert.ok(r.names.includes(name), name)
    // A farmer's request is never blocked: the trial goes through its own approval at the first stage.
    assert.equal(r.trial.isError, false)
    // Stages follow engagement: history, then questions plus a cost check, and a turned-down suggestion steps back.
    assert.deepEqual(r.stages, { start: 1, afterHistory: 2, afterRisk: 3, afterDecline: 2, quiet: 1 })
    // The risk check is read-only: it uses the field's dry years and labels example numbers, but saves nothing.
    assert.match(r.riskText, /Dry years came 3 of the last 5/)
    assert.match(r.riskText, /examples, not data/)
    assert.equal(r.riskStateBefore, 0)
    // Saving the estimate takes approval and stores what risk_check showed, not numbers the model restates.
    assert.equal(r.saved.field, 'North pivot')
    assert.equal(r.saved.dry.value, 35)
    // Checking the estimate after the season builds the track record the packet reports.
    assert.equal(r.checkedEstimate.landedInRange, true)
    assert.match(r.checkedEstimate.trackRecord, /1 of 1/)
    assert.match(r.packetText, /North pivot/)
    assert.match(r.packetText, /track record on this farm: 1 of 1/)
    // Quiet needs no approval; going back to auto does, and a rejection keeps quiet.
    assert.equal(r.refusedAuto.error.info.code, 'APPROVAL_REJECTED')
    assert.equal(r.final.pace, 'quiet')
    // Forgetting signals keeps the estimates.
    assert.equal(r.final.signals.length, 0)
    assert.equal(r.final.estimates.length, 1)
    assert.deepEqual(r.asked, ['plan_crop_trial', 'save_estimate', 'check_estimate', 'agronomist_packet', 'trust_set_pace', 'trust_forget'])
  } finally {
    server.kill('SIGTERM')
    const kill = setTimeout(() => server.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(kill)
    await rm(home, { recursive: true, force: true })
  }
})
