/** First-run transitions are durable and serialize independent launch requests. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FarmOnboarding } from './onboarding-progress.ts'
test('parallel tabs create one Session and greeting; pause, resume, and completion survive reload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fieldwork-progress-'))
  let creates = 0; let starts = 0; let cancels = 0
  const owner = { async create() { creates++; return 'saved-setup-session' }, async begin() { starts++ }, cancel() { cancels++ } }
  const file = join(directory, 'onboarding.json')
  const service = FarmOnboarding.open(file, owner)
  try {
    assert.equal(service.snapshot().phase, 'new')
    await Promise.all([service.perform('prepare'), service.perform('prepare')])
    assert.equal(creates, 1); assert.equal(starts, 0)
    assert.equal(service.snapshot().phase, 'agent-setup')
    await Promise.all([service.perform('begin'), service.perform('begin')])
    assert.equal(starts, 1)
    await service.perform('defer')
    const restored = FarmOnboarding.open(file, owner)
    await restored.perform('prepare')
    assert.equal(restored.snapshot().phase, 'deferred')
    assert.equal(starts, 1)
    await restored.perform('resume'); await restored.perform('begin')
    assert.equal(restored.snapshot().sessionId, 'saved-setup-session'); assert.equal(starts, 1)
    await restored.perform('complete'); await restored.close()
    const completed = FarmOnboarding.open(file, owner)
    await completed.perform('prepare')
    assert.equal(completed.snapshot().phase, 'complete'); assert.equal(creates, 1); assert.equal(cancels, 2)
    await completed.close()
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }) }
})
test('failed prompt admission can retry; corrupt progress is preserved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fieldwork-progress-'))
  const file = join(directory, 'onboarding.json')
  let attempts = 0
  const service = FarmOnboarding.open(file, { async create() { return 'setup-session' }, async begin() { if (++attempts === 1) throw new Error('Admission failed') }, cancel() {} })
  try {
    await service.perform('prepare')
    await assert.rejects(service.perform('begin'), /Admission failed/)
    assert.equal(service.snapshot().phase, 'agent-setup'); assert.equal(service.snapshot().started, false)
    await service.perform('begin'); assert.equal(attempts, 2)
    await service.close()
    await writeFile(file, '{invalid')
    assert.throws(() => FarmOnboarding.open(file, { async create() { return 'x' }, async begin() {}, cancel() {} }))
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }) }
})
