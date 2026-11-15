/** Learning regressions exercise real files, scheduler recovery, outcome limits, and cancellation. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FarmRecords } from './records.ts'
import { LearningWorkspace, type LearningOptions } from './learning.ts'
import { LearningError } from './learning-error.ts'
import { DemoSatelliteProvider, qualifiedNdvi, insidePolygon, type SatelliteProvider } from './satellite.ts'
import { boundarySchema } from './learning-types.ts'
import { parseHarvestCsv } from './learning-calculations.ts'
const options = (root: string): LearningOptions => ({ root, pollSeconds: 30, checkTimeoutSeconds: 5, scenesPerCheck: 3 })
async function fixture(provider?: SatelliteProvider, now?: () => Date, overrides: Partial<LearningOptions> = {}) {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-learning-'))
  const farm = FarmRecords.open(join(home, 'farm.json')), workspace = await LearningWorkspace.open({ ...options(join(home, 'learning')), ...overrides }, farm, provider, now)
  return { home, farm, workspace, async dispose() { await workspace.dispose(); await rm(home, { recursive: true, force: true }) } }
}
test('NDVI excludes missing/uncertain classes and uses physical reflectance', () => {
  assert.ok(Math.abs(qualifiedNdvi(.1, .5, 4)! - 2 / 3) < 1e-12)
  assert.equal(qualifiedNdvi(.1, .5, 9), null)
  assert.equal(qualifiedNdvi(.1, .5, 3), null)
  assert.equal(qualifiedNdvi(0, 0, 4), null)
  assert.equal(qualifiedNdvi(-.1, .5, 4), null)
  assert.throws(() => boundarySchema.parse({ type: 'Polygon', coordinates: [[[0, 0], [.01, .01], [0, .01], [.01, 0], [0, 0]]] }), /crossing/)
  assert.equal(insidePolygon(1, 1, [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]), true)
  assert.equal(insidePolygon(3, 1, [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]), false)
  assert.deepEqual(parseHarvestCsv('block,baselineYield,alternativeYield\n1,0,2'), [{ block: 1, baselineYield: 0, alternativeYield: 2 }])
  assert.throws(() => parseHarvestCsv('block,baselineYield,alternativeYield\n1,,2'), /numeric/)
})
test('weekly checks catch up once, deduplicate observations, pause, and survive reopen', async () => {
  let now = new Date('2026-07-01T12:00:00Z')
  const f = await fixture(undefined, () => now)
  try {
    const id = await f.workspace.createDemo()
    await f.workspace.tick()
    assert.equal(f.workspace.snapshot().checks[0]!.status, 'available')
    assert.equal(f.workspace.snapshot().monitors[0]!.nextCheckAt, '2026-07-08T12:00:00.000Z')
    await f.workspace.tick(); assert.equal(f.workspace.snapshot().checks.length, 1)
    const second = await f.workspace.checkNow(id); assert.equal(second.status, 'no-new-data'); assert.equal(f.workspace.snapshot().monitors[0]!.nextCheckAt, '2026-07-08T12:00:00.000Z', 'manual checks preserve the next weekly occurrence')
    now = new Date('2026-08-02T12:00:00Z'); await f.workspace.tick()
    assert.equal(f.workspace.snapshot().checks.length, 3, 'one check catches up, not one per missed week')
    assert.equal(f.workspace.snapshot().monitors[0]!.nextCheckAt, '2026-08-05T12:00:00.000Z')
    await f.workspace.setMonitorActive(id, false); now = new Date('2026-09-02T12:00:00Z'); await f.workspace.tick(); assert.equal(f.workspace.snapshot().checks.length, 3)
    const state = f.workspace.snapshot(), file = state.artifacts.find(a => a.filename === 'check.json')!
    assert.match((await f.workspace.readArtifact(file.id)).bytes.toString(), /available/)
    await f.workspace.dispose()
    const reopened = await LearningWorkspace.open(options(join(f.home, 'learning')), f.farm, undefined, () => now)
    assert.equal(reopened.snapshot().monitors[0]!.active, false)
    assert.equal(reopened.snapshot().checks.length, 3)
    await reopened.dispose()
  } finally { await f.dispose() }
})
test('no scenes, unusable imagery, provider failure, and recovery stay distinct', async () => {
  let stage: 'none' | 'cloud' | 'failure' | 'ready' = 'none'
  const demo = new DemoSatelliteProvider()
  const provider: SatelliteProvider = {
    async search(m, a, b, signal) { if (stage === 'failure') throw new LearningError('Provider unavailable', 'MONITOR_PROVIDER'); if (stage === 'none') return { scenes: [], limited: false }; return demo.search(m, a, b, signal) },
    async process(m, s, signal) { const p = await demo.process(m, s, signal); if (stage === 'cloud') { p.observation.qualified = false; p.observation.usableFraction = 0; p.observation.validPixels = 0; p.observation.meanNdvi = null; p.observation.grid!.values.fill(null) }; return p },
  }
  const f = await fixture(provider)
  try {
    const demoId = await f.workspace.createDemo(), monitor = f.workspace.snapshot().monitors[0]!
    await f.workspace.setMonitorActive(demoId, false)
    await f.farm.change(s => { s.fields[0]!.evidence = 'farmer-reported' })
    const id = await f.workspace.enableMonitor({ ...monitor, mode: 'live' })
    assert.equal((await f.workspace.checkNow(id)).status, 'no-new-data')
    stage = 'cloud'; assert.equal((await f.workspace.checkNow(id)).status, 'no-usable-data')
    stage = 'failure'; const failed = await f.workspace.checkNow(id); assert.equal(failed.status, 'provider-error'); assert.equal(failed.error?.code, 'MONITOR_PROVIDER')
    stage = 'ready'; assert.equal((await f.workspace.checkNow(id)).status, 'no-new-data', 'already examined cloudy scene is not duplicated')
    assert.ok(f.workspace.snapshot().checks.every(c => c.mode === 'live'))
  } finally { await f.dispose() }
})
test('scouting, reviewed trial, and paired outcome retain their files and original baseline', async () => {
  const f = await fixture()
  try {
    const id = await f.workspace.createDemo(), check = await f.workspace.checkNow(id), fieldId = f.workspace.snapshot().monitors[0]!.fieldId
    const scoutId = await f.workspace.saveScout({ fieldId, checkId: check.id, question: 'What differs in the lower corner?', notes: 'Observed: lower stand count. Hypothesis: wet ground. Missing: harvest measurements.' })
    const trialId = await f.workspace.draftTrial({ fieldId, scoutId, sourceIds: [], question: 'Does the alternative change observed yield?', baseline: 'Current farmer-selected rate', alternative: 'One farmer-selected alternative', constraints: 'Use existing equipment; review layout locally.', measurements: 'Comparable moisture-corrected block yields in t/ha.', design: 'randomized-block', replicates: 3 })
    await assert.rejects(f.workspace.recordOutcome({ id: trialId, unit: 't/ha', rows: [{ block: 1, baselineYield: 10, alternativeYield: 11 }], interpretation: 'Partial', farmerDecision: 'Repeat' }), /Start tracking/)
    await f.workspace.startTrial(trialId)
    await f.workspace.recordOutcome({ id: trialId, unit: 't/ha', rows: [{ block: 1, baselineYield: 10, alternativeYield: 11 }, { block: 2, baselineYield: 12, alternativeYield: 12 }], interpretation: 'One planned block missing. Descriptive only.', farmerDecision: 'Keep baseline and repeat.' })
    const trial = f.workspace.snapshot().trials[0]!
    assert.equal(trial.results!.meanDifference, .5); assert.equal(trial.results!.complete, false)
    assert.equal(trial.baseline, 'Current farmer-selected rate'); assert.equal(trial.scoutId, scoutId)
    const followup = await f.workspace.draftTrial({ ...trial, previousTrialId: trialId, question: 'Repeat with a revised layout next season.' })
    assert.equal(f.workspace.snapshot().trials.find(t => t.id === followup)!.previousTrialId, trialId)
    assert.equal(f.workspace.snapshot().trials[0]!.status, 'reviewed')
    const note = f.workspace.snapshot().artifacts.find(a => a.filename === 'learning.md')!
    assert.match((await f.workspace.readArtifact(note.id)).bytes.toString(), /Keep baseline and repeat/)
    await assert.rejects(f.workspace.recordOutcome({ id: trialId, unit: 't/ha', rows: [{ block: 1, baselineYield: 1, alternativeYield: 2 }], interpretation: 'Rewrite', farmerDecision: 'Change' }), /previous outcomes remain fixed/)
    await writeFile(join(f.home, 'learning', note.path), 'Edited outside the application')
    await assert.rejects(f.workspace.readArtifact(note.id), /changed or cannot be read/)
  } finally { await f.dispose() }
})
test('concurrent checks share admission and disposal persists an interrupted receipt', async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const provider: SatelliteProvider = { async search(_m, _a, _b, signal) { started(); return new Promise((_resolve, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }) }) }, async process() { throw new Error('No scene should be processed') } }
  const f = await fixture(provider)
  try {
    const demoId = await f.workspace.createDemo(), m = f.workspace.snapshot().monitors[0]!
    await f.workspace.setMonitorActive(demoId, false); await f.farm.change(s => { s.fields[0]!.evidence = 'farmer-reported' })
    const id = await f.workspace.enableMonitor({ ...m, mode: 'live' })
    const a = f.workspace.checkNow(id), b = f.workspace.checkNow(id)
    assert.equal(a, b); await ready
    const crashRoot = join(f.home, 'crash-copy'); await mkdir(crashRoot); const { methods: _methods, workspace: _workspace, ...snapshot } = f.workspace.snapshot(); await writeFile(join(crashRoot, 'index.json'), JSON.stringify(snapshot))
    await f.workspace.dispose(); assert.equal((await a).status, 'interrupted'); assert.equal(f.workspace.snapshot().checks.length, 1)
    await assert.rejects(f.workspace.checkNow(id), /stopping/)
    const reopened = await LearningWorkspace.open(options(crashRoot), f.farm, provider)
    assert.equal(reopened.snapshot().checks[0]!.status, 'interrupted'); assert.equal(reopened.snapshot().checks[0]!.error?.code, 'RUNTIME_RESTARTED'); await reopened.dispose()
  } finally { await f.dispose() }
})
test('an imported GeoJSON keeps original properties and a changed method gets a new pinned hash', async () => {
  const f = await fixture()
  try {
    const id = await f.workspace.createDemo(), m = f.workspace.snapshot().monitors[0]!
    await f.workspace.setMonitorActive(id, false)
    const original = JSON.stringify({ type: 'Feature', properties: { farmerName: 'Original field name', notes: 'Keep these original properties' }, geometry: m.boundary }, null, 2)
    const source = await f.farm.importSource(Buffer.from(original), { title: 'Existing field boundary', filename: 'field.geojson', origin: 'Farmer field file', evidence: 'demo', scope: 'Fictional reference boundary only' })
    const methodFile = join(f.home, 'learning/methods/watch-field/v1/SKILL.md')
    await writeFile(methodFile, '# Farmer method\n\nRead my existing worksheet and retain the current approach.\n')
    const { boundary: _boundary, ...config } = m
    const nextId = await f.workspace.enableMonitor({ ...config, boundarySourceId: source.id })
    const next = f.workspace.snapshot().monitors.find(m => m.id === nextId)!
    assert.deepEqual(next.boundary, m.boundary); assert.notEqual(next.method.sha256, m.method.sha256)
    assert.equal((await f.workspace.readArtifact(next.boundaryArtifactId)).bytes.toString(), original)
    assert.match((await f.workspace.readArtifact(next.methodArtifactId)).bytes.toString(), /existing worksheet/)
    assert.equal(f.workspace.snapshot().monitors[0]!.method.sha256, m.method.sha256)
  } finally { await f.dispose() }
})
test('a failed storage commit stops monitoring and exposes a persistent runtime fault', async () => {
  const f = await fixture()
  try {
    const id = await f.workspace.createDemo(), old = f.workspace.snapshot()
    await mkdir(join(f.home, 'learning/index.json.tmp'))
    await assert.rejects(f.workspace.setMonitorActive(id, false), error => error instanceof LearningError && error.code === 'LEARNING_STORAGE')
    assert.ok(f.workspace.snapshot().storageError)
    assert.equal(f.workspace.snapshot().monitors[0]!.active, old.monitors[0]!.active, 'failed mutation never claims acceptance')
    await f.workspace.tick(); assert.equal(f.workspace.snapshot().checks.length, 0)
    await assert.rejects(f.workspace.checkNow(id), /Monitoring is stopped/)
  } finally { await f.dispose() }
})
test('the owned poller executes a due data-availability check without a model or browser', async () => {
  const provider: SatelliteProvider = { async search() { return { scenes: [], limited: false } }, async process() { throw new Error('An empty catalog has no pixels to process') } }
  const f = await fixture(provider, undefined, { pollSeconds: 1 })
  let stop = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const demoId = await f.workspace.createDemo(), monitor = f.workspace.snapshot().monitors[0]!
    await f.workspace.setMonitorActive(demoId, false); await f.farm.change(s => { s.fields[0]!.evidence = 'farmer-reported' })
    await f.workspace.enableMonitor({ ...monitor, mode: 'live' })
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Owned poller did not commit its receipt')), 10000)
      stop = f.workspace.subscribe(() => { if (f.workspace.snapshot().checks.some(c => c.status === 'no-new-data')) resolve() })
      f.workspace.start(reject)
    })
    assert.equal(f.workspace.snapshot().checks.length, 1)
    await f.workspace.dispose(); assert.equal(f.workspace.snapshot().checks[0]!.status, 'no-new-data')
  } finally { if (timer) clearTimeout(timer); stop(); await f.dispose() }
})
test('a failed season can retain a reviewed decision without invented yield measurements', async () => {
  const f = await fixture()
  try {
    await f.workspace.createDemo(); const fieldId = f.workspace.snapshot().monitors[0]!.fieldId
    const id = await f.workspace.draftTrial({ fieldId, sourceIds: [], question: 'What can we learn after hail stopped the comparison?', baseline: 'Usual practice', alternative: 'One change', constraints: 'One season', measurements: 'Planned matched harvest yields', design: 'exploratory', replicates: 1 })
    await f.workspace.startTrial(id)
    const rows = parseHarvestCsv('block,baselineYield,alternativeYield\n')
    await f.workspace.recordOutcome({ id, unit: 't/ha', rows, interpretation: 'Hail prevented comparable harvest measurements.', farmerDecision: 'Retain baseline and repeat next season.' })
    const results = f.workspace.snapshot().trials[0]!.results!
    assert.equal(results.baselineMean, null); assert.equal(results.alternativeMean, null); assert.equal(results.meanDifference, null); assert.equal(results.complete, false)
  } finally { await f.dispose() }
})
