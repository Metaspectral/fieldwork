/** Persistence and scientific-scope checks independent of model prose. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FarmRecords, draftTrial, seedComparison } from './records.ts'

test('purchase costs use explicit units and do not imply yield', () => {
  assert.equal(seedComparison(12, 1.5, 120, 108).savingCad, 216)
  assert.equal(seedComparison(2, 2, 100, 110).savingCad, -40)
  assert.throws(() => seedComparison(-1, 1.5, 120, 108))
})
test('private records persist; reviewed summaries exclude raw observations and retain attribution', async () => {
  const home = await mkdtemp(join(tmpdir(), 'native-farm-'))
  try {
    const path = join(home, 'records.json')
    const records = await FarmRecords.open(path)
    const trial = draftTrial('Test a strip', 'Usual practice', 'One small change', 'Neighbour’s method v1')
    await records.change(s => { trial.observations.push('PRIVATE cost CAD 500'); s.trials.push(trial) })
    const preview = records.preview(trial.id, 'One-season trial', 'Inconclusive')
    assert.ok(!JSON.stringify(preview).includes('PRIVATE'))
    assert.equal(preview.summary.source, 'Neighbour’s method v1')
    assert.throws(() => records.reviewed('unreviewed'))
    const reopened = await FarmRecords.open(path)
    assert.equal(reopened.snapshot().trials[0]?.observations[0], 'PRIVATE cost CAD 500')
    await assert.rejects(reopened.change(s => { s.farm.areaHa = -1 }))
    assert.equal(reopened.snapshot().farm.areaHa, 12)
    await writeFile(path, 'corrupt')
    assert.throws(() => FarmRecords.open(path), /preserved/)
  } finally { await rm(home, { recursive: true, force: true }) }
})
