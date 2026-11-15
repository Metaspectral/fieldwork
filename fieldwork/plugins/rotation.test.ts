/** Rotation library, budget arithmetic, record migration and acceptance rules. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FarmRecords } from './records.ts'
import { saveField } from './planning.ts'
import { fieldRotation, parseRotationLibrary, plannedCrop, rotationCalculation, rotationLibrary, rotationName, type RotationInputs } from './rotation-domain.ts'
import { acceptRotation, proposeRotation, saveFieldCrops } from './rotation-planning.ts'
import { loadRotationDemo } from './rotation-demo.ts'

const acre = 4046.8564224 / 10000
const side = (id: string, columns: RotationInputs['current']['columns']) => { const r = rotationLibrary.rotations.find(r => r.id === id)!; return { rotationId: r.id, crops: r.crops, source: r.source, columns } }
const corn = { yield: 180, price: 4.2, costs: 500 }, soybean = { yield: 55, price: 10.8, costs: 305 }
const example = (): RotationInputs => ({ areaHa: 160 * acre, landCost: 230, currency: 'USD', current: side('cs', [corn, soybean]), alternative: side('cowws', [corn, { yield: 90, price: 3.5, otherIncome: 20, costs: 145 }, { yield: 60, price: 6, otherIncome: 30, costs: 179 }, soybean]) })
async function withRecords(run: (records: FarmRecords, file: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-rotation-'))
  try { const file = join(home, 'records.json'); await run(FarmRecords.open(file), file) } finally { await rm(home, { recursive: true, force: true }) }
}

test('library holds the six Brookings rotations, each with a source and limits', () => {
  assert.deepEqual(rotationLibrary.rotations.map(r => r.id), ['cs', 'ccc', 'csswsf', 'csswp', 'cpwws', 'cowws'])
  for (const r of rotationLibrary.rotations) { assert.equal(r.source.kind, 'published-study'); assert.equal(r.source.doi, '10.1002/agj2.21688'); assert.match(r.limits, /One research site near Brookings/) }
  assert.deepEqual(rotationLibrary.rotations.filter(r => r.kind === 'usual-in-study').map(r => r.id), ['cs', 'ccc'])
  assert.equal(rotationName(rotationLibrary.rotations[5]!.crops), 'Corn–oats–winter wheat–soybean')
  assert.equal(rotationName(['corn']), 'Continuous corn')
  assert.doesNotMatch(JSON.stringify(rotationLibrary), /\d+(\.\d+)? ?(bu|\$|USD|per acre)/, 'no prices, yields or returns in the library')
})
test('a library entry without a source, or with an unknown crop, is rejected', () => {
  const entry = { id: 'x', crops: ['corn', 'soybean'], kind: 'tested-alternative', limits: 'One site.' }
  assert.throws(() => parseRotationLibrary({ region: { id: 'r', name: 'R' }, rotations: [entry] }))
  const source = { kind: 'community', citation: 'A neighbour' }
  assert.throws(() => parseRotationLibrary({ region: { id: 'r', name: 'R' }, rotations: [{ ...entry, source, crops: ['kale'] }] }))
  assert.throws(() => parseRotationLibrary({ region: { id: 'r', name: 'R' }, rotations: [{ ...entry, source }, { ...entry, source }] }))
  assert.equal(parseRotationLibrary({ region: { id: 'r', name: 'R' }, rotations: [{ ...entry, source }] }).rotations.length, 1)
})
test('budget adds up per acre and per crop-year, then scales to the field', () => {
  const result = rotationCalculation(example())
  assert.deepEqual(result.current.columns[0], { income: 756, totalCost: 730, profit: 26 })
  assert.equal(result.current.perAcre, 42.5); assert.equal(result.current.wholeField, 6800)
  assert.deepEqual(result.alternative!.columns.map(c => c!.profit), [26, -40, -19, 59])
  assert.equal(result.alternative!.perAcre, 6.5); assert.equal(result.alternative!.wholeField, 1040)
  assert.deepEqual(result.difference, { perAcre: -36, wholeField: -5760 })
  assert.equal(result.method, 'rotation-budget-v1')
})
test('a blank number leaves that rotation uncalculated instead of treating it as zero', () => {
  const input = example(); input.alternative!.columns[1] = { yield: 90, costs: 145 }
  const result = rotationCalculation(input)
  assert.equal(result.current.perAcre, 42.5)
  assert.equal(result.alternative!.perAcre, undefined); assert.equal(result.alternative!.columns[1], null); assert.equal(result.difference, undefined)
  const { landCost: _l, ...noLand } = example()
  assert.equal(rotationCalculation(noLand).current.perAcre, undefined)
  assert.throws(() => rotationCalculation({ ...example(), current: { ...example().current, columns: [corn] } }), /one column of numbers per crop-year/)
})
test('version 2 records migrate to version 3 with a backup', async () => {
  await withRecords(async (fresh, file) => {
    const { rotationPlans: _r, ...old } = fresh.snapshot()
    const bytes = JSON.stringify({ ...old, version: 2 })
    await writeFile(file, bytes)
    const records = FarmRecords.open(file)
    assert.equal(await readFile(`${file}.v2.backup`, 'utf8'), bytes)
    assert.equal(await readFile(file, 'utf8'), bytes, 'opening does not replace the original')
    await records.change(s => { s.farm.name = 'Confirmed farmer name' })
    const reopened = FarmRecords.open(file).snapshot()
    assert.equal(reopened.version, 3); assert.deepEqual(reopened.rotationPlans, [])
    assert.equal(await readFile(`${file}.v2.backup`, 'utf8'), bytes)
  })
})
test('propose, accept, and read the field’s rotation and planned crops', async () => {
  await withRecords(async records => {
    const fieldId = await saveField(records, { name: 'Home quarter', areaHa: 160 * acre, evidence: 'farmer-reported', notes: [] })
    await saveFieldCrops(records, { fieldId, crops: { 2025: 'corn', 2026: 'soybean' } })
    assert.equal(records.snapshot().fields[0]!.years['2026']!.crop, 'soybean')
    await saveFieldCrops(records, { fieldId, crops: { 2025: null } })
    assert.equal(records.snapshot().fields[0]!.years['2025'], undefined)
    await assert.rejects(saveFieldCrops(records, { fieldId, crops: { 2026: 'kale' } }))
    const proposal = { fieldId, season: 2027, reason: 'Wheat spreads my workload.', choice: 'alternative' as const, startIndex: 1, evidence: 'farmer-reported' as const, inputs: example() }
    await assert.rejects(proposeRotation(records, { ...proposal, inputs: { ...example(), areaHa: 10 } }), /matching confirmed area/)
    await assert.rejects(proposeRotation(records, { ...proposal, startIndex: 4 }), /starting crop/)
    const { id } = await proposeRotation(records, proposal)
    assert.equal(fieldRotation(records.snapshot().rotationPlans, fieldId), undefined, 'a proposal changes nothing')
    await acceptRotation(records, id)
    const plan = fieldRotation(records.snapshot().rotationPlans, fieldId)!
    assert.equal(plan.id, id)
    assert.deepEqual([2026, 2027, 2028, 2029, 2030, 2031].map(y => plannedCrop(plan, y)), [undefined, 'oats', 'winter-wheat', 'soybean', 'corn', 'oats'])
    assert.equal(records.snapshot().fields[0]!.years['2027'], undefined, 'planned crops are not written into grown-crop history')
    const revision = await proposeRotation(records, { ...proposal, supersedes: id, choice: 'current', startIndex: 0 })
    assert.equal(records.snapshot().rotationPlans.find(p => p.id === revision.id)!.revision, 2)
    await assert.rejects(acceptRotation(records, id), /proposed plan/)
  })
})
test('acceptance is blocked by blank numbers, a changed area, and demo numbers on a real field', async () => {
  await withRecords(async records => {
    const fieldId = await saveField(records, { name: 'North forty', areaHa: 40 * acre, evidence: 'farmer-reported', notes: [] })
    const base = { fieldId, season: 2027, reason: 'Compare before changing.', choice: 'current' as const, startIndex: 0, evidence: 'farmer-reported' as const }
    const blank = example(); blank.areaHa = 40 * acre; blank.alternative!.columns[2] = {}
    await assert.rejects(acceptRotation(records, (await proposeRotation(records, { ...base, inputs: blank })).id), /missing numbers/)
    const full = { ...example(), areaHa: 40 * acre }
    await assert.rejects(acceptRotation(records, (await proposeRotation(records, { ...base, evidence: 'demo', inputs: full })).id), /demo numbers/)
    const keepOnly = await proposeRotation(records, { ...base, inputs: { areaHa: 40 * acre, currency: 'USD', current: side('cs', [{}, {}]) } })
    await acceptRotation(records, keepOnly.id)
    const changed = await proposeRotation(records, { ...base, inputs: full })
    await saveField(records, { id: fieldId, name: 'North forty', areaHa: 41 * acre, evidence: 'farmer-reported', notes: [] })
    await assert.rejects(acceptRotation(records, changed.id), /area changed/)
  })
})
test('the fictional example is labelled demo and can be accepted only on its demo field', async () => {
  await withRecords(async records => {
    const { id } = await loadRotationDemo(records)
    const s = records.snapshot()
    assert.equal(s.fields.length, 3); assert.ok(s.fields.every(f => f.evidence === 'demo' && f.name.includes('fictional demo')))
    assert.equal(s.rotationPlans[0]!.evidence, 'demo'); assert.equal(s.rotationPlans[0]!.calculation.difference!.wholeField, -5760)
    await acceptRotation(records, id)
    assert.equal(plannedCrop(fieldRotation(records.snapshot().rotationPlans, s.fields[0]!.id)!, s.rotationPlans[0]!.season), 'soybean')
  })
})
