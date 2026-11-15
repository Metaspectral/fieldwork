/** Opt-in public-data integration: no subscription, farmer location, or credentials. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { FarmRecords } from './records.ts'
import { LearningWorkspace } from './learning.ts'
test('public Sentinel-2 C1 check retains qualified pixels, scaling, sources, and a durable receipt', { skip: process.env.FIELDWORK_SATELLITE_TEST !== '1', timeout: 180000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-live-sentinel-')), farm = FarmRecords.open(join(home, 'farm.json'))
  let workspace: LearningWorkspace | undefined
  try {
    await farm.change(s => { s.fields.push({ id: 'public-reference', name: 'Public software-verification area; not a user farm', evidence: 'regional', years: {}, notes: ['Reference imagery for software verification only; no production conclusion.'] }) })
    workspace = await LearningWorkspace.open({ root: join(home, 'learning'), pollSeconds: 30, checkTimeoutSeconds: 90, scenesPerCheck: 1 }, farm, undefined, () => new Date('2026-07-31T12:00:00Z'))
    const id = await workspace.enableMonitor({ fieldId: 'public-reference', mode: 'live', question: 'Can the installed workflow retrieve and qualify a public reference scene?', boundary: { type: 'Polygon', coordinates: [[[-100.872, 37.98], [-100.86, 37.98], [-100.86, 37.99], [-100.872, 37.99], [-100.872, 37.98]]] }, lookbackDays: 30, minUsableFraction: .6, minValidPixels: 16 })
    const check = await workspace.checkNow(id)
    assert.equal(check.status, 'available', check.error?.message)
    const scene = check.scenes[0]!
    assert.ok(scene.validPixels >= 16); assert.ok(scene.usableFraction >= .6); assert.ok(scene.meanNdvi !== null && scene.meanNdvi >= -1 && scene.meanNdvi <= 1)
    const artifacts = join(process.cwd(), '.artifacts/live-satellite', basename(home)); await mkdir(artifacts, { recursive: true })
    const files = workspace.snapshot().artifacts.filter(a => check.artifactIds.includes(a.id))
    for (const file of files) await writeFile(join(artifacts, file.filename), (await workspace.readArtifact(file.id)).bytes)
    await writeFile(join(artifacts, 'verification.json'), JSON.stringify({ publicReference: true, status: check.status, item: scene.id, validPixels: scene.validPixels, totalPixels: scene.totalPixels, meanNdvi: scene.meanNdvi, usableFraction: scene.usableFraction, artifacts: files.map(a => ({ filename: a.filename, sha256: a.sha256 })) }, null, 2))
    assert.ok(files.some(f => f.filename === 'source-item.json')); assert.ok(files.some(f => f.filename === 'cropped-pixels.csv')); assert.ok(files.some(f => f.filename === 'check.json'))
    await workspace.dispose(); workspace = await LearningWorkspace.open({ root: join(home, 'learning'), pollSeconds: 30, checkTimeoutSeconds: 90, scenesPerCheck: 1 }, farm)
    assert.equal(workspace.snapshot().checks[0]!.status, 'available')
  } finally { await workspace?.dispose(); await rm(home, { recursive: true, force: true }) }
})
