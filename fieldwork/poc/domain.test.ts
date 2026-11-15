/** Behavioral checks for farmer control, arithmetic, publication, and durable records. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FarmStore, compareSeed } from './domain.ts'

test('quote comparison uses units and supports a more expensive alternative', () => {
  assert.equal(compareSeed(12, 1.5, 120, 108).saving, 216)
  assert.equal(compareSeed(2, 2, 100, 110).saving, -40)
  assert.throws(() => compareSeed(-1, 2, 100, 110))
})

test('activation, trial adaptation, tracking, and publication preserve private records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fieldwork-test-'))
  try {
    const file = join(directory, 'workspace.json')
    const store = await FarmStore.open(file)
    const baseline = store.snapshot().farm
    await assert.rejects(store.execute({ action: 'plan', trialArea: 1, crop: 'Peas' }), /Activate/)
    await store.execute({ action: 'activate', plugin: 'crop-plan', enabled: true })
    await assert.rejects(store.execute({ action: 'plan', trialArea: 13, crop: 'Peas' }), /exceed/)
    assert.equal((await store.execute({ action: 'plan', trialArea: .5, crop: 'Peas' })).result?.retainedArea, 11.5)
    assert.equal(store.snapshot().runs[0]?.plugin, 'crop-plan')
    assert.deepEqual(store.snapshot().farm, baseline)
    await store.execute({ action: 'adapt', postId: 'demo-1' })
    const trial = store.snapshot().experiments[0]!
    assert.equal(trial.status, 'draft')
    await store.execute({ action: 'edit', id: trial.id, title: trial.title, baseline: 'Our own baseline', change: trial.change })
    assert.equal(store.snapshot().experiments[0]?.source, trial.source)
    await assert.rejects(store.execute({ action: 'observe', id: trial.id, observation: 'private cost CAD 500 and exact location' }), /Start observation/)
    await store.execute({ action: 'track', id: trial.id })
    await store.execute({ action: 'observe', id: trial.id, observation: 'private cost CAD 500 and exact location' })
    await assert.rejects(store.execute({ action: 'publish', id: trial.id, title: 'Trial', takeaway: 'Inconclusive' }))
    await store.execute({ action: 'publish', id: trial.id, title: 'Trial', takeaway: 'Inconclusive', confirmed: true })
    const summary = store.snapshot().posts.at(-1)!
    assert.ok(!JSON.stringify(summary).includes('CAD 500'))
    assert.ok(!('farm' in summary))
    assert.equal(summary.source, trial.source)
    await store.execute({ action: 'withdraw', id: summary.id })
    assert.equal(store.snapshot().experiments.length, 1)
    await store.execute({ action: 'activate', plugin: 'crop-plan', enabled: false })
    const reopened = await FarmStore.open(file)
    assert.equal(reopened.snapshot().experiments[0]?.observations.length, 1)
    assert.ok(!reopened.snapshot().active.includes('crop-plan'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('concurrent accepted mutations are not lost', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fieldwork-concurrent-'))
  try {
    const store = await FarmStore.open(join(directory, 'workspace.json'))
    await Promise.all([store.execute({ action: 'adapt', postId: 'demo-1' }), store.execute({ action: 'adapt', postId: 'demo-2' })])
    assert.equal(store.snapshot().experiments.length, 2)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
