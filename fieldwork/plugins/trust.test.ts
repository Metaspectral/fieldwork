/** Trust guideline stages, the estimate track record, evidence checks, and risk arithmetic, independent of model prose. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asEvidence, checkEvidence, renderPacket, ResultLog, seriousIssues } from './evidence.ts'
import { EXAMPLE_CROPS, riskCheck, type RiskModel } from './risk.ts'
import { checkEstimate, DEFAULT_RULES, evaluate, forget, initialState, note, promptSection, saveEstimate, trackRecord, TrustRecords, type SignalKind, type TrustState } from './trust.ts'

const now = new Date('2026-11-14T12:00:00Z')
const add = (s: TrustState, ...kinds: SignalKind[]) => kinds.reduce((acc, kind) => note(acc, { kind }, now), s)
const model: RiskModel = { crops: EXAMPLE_CROPS, cropsAreExamples: true, diversityDryCredit: 15, relativeUncertainty: 0.3 }
const stage = (s: TrustState) => evaluate(s, DEFAULT_RULES).stage

test('Fieldwork volunteers more only as the farmer engages, and says what would change it', () => {
  const start = initialState()
  assert.equal(stage(start), 1)
  assert.match(evaluate(start, DEFAULT_RULES).next ?? '', /Explain once the farmer chooses to look at the field history/)
  const looked = add(start, 'history_viewed', 'history_viewed')
  assert.equal(stage(looked), 2)
  // Curiosity alone is not enough for a trial suggestion; the farmer must also ask what a change would cost.
  const curious = add(looked, 'question_asked', 'source_opened')
  assert.equal(stage(curious), 2)
  const askedCost = add(curious, 'risk_viewed')
  assert.equal(stage(askedCost), 3)
  assert.equal(stage(add(askedCost, 'trial_saved')), 3)
  assert.equal(stage(add(askedCost, 'trial_saved', 'outcome_recorded')), 4)
})

test('a declined suggestion quiets new ones for a while, and quiet pace stays quiet', () => {
  const ready = add(initialState(), 'history_viewed', 'history_viewed', 'question_asked', 'source_opened', 'risk_viewed')
  const declined = add(ready, 'suggestion_declined')
  assert.equal(stage(declined), 2)
  assert.match(evaluate(declined, DEFAULT_RULES).why.join(' '), /turned down a suggestion/)
  assert.equal(stage(add(declined, 'history_viewed', 'history_viewed', 'history_viewed', 'history_viewed')), 2)
  assert.equal(stage(add(declined, 'history_viewed', 'history_viewed', 'history_viewed', 'history_viewed', 'history_viewed')), 3)
  const quiet = { ...ready, pace: 'quiet' as const }
  assert.equal(stage(quiet), 1)
  assert.match(evaluate(quiet, DEFAULT_RULES).next ?? '', /back to auto/)
})

test('estimates are saved once per day and change, then checked against the range for that kind of year', () => {
  const estimate = { field: 'North pivot', change: 'soybean instead of corn', unit: 'USD/acre', example: true, normal: { value: -40, low: -52, high: -28 }, dry: { value: 50, low: 35, high: 65 } }
  const first = saveEstimate(initialState(), estimate, now)
  const again = saveEstimate(first.state, estimate, now)
  assert.equal(again.id, first.id)
  assert.equal(again.state.estimates.length, 1)
  assert.equal(trackRecord(again.state.estimates).text, 'No estimates checked against a real season yet.')
  const hit = checkEstimate(again.state, first.id, 'dry', 41, 'Strip beat the corn in the drought', now)
  assert.equal(hit.estimates[0]!.checked!.hit, true)
  assert.throws(() => checkEstimate(hit, first.id, 'dry', 41, undefined, now), /already checked/)
  assert.throws(() => checkEstimate(hit, 'est-missing', 'dry', 1, undefined, now), /No saved estimate/)
  const other = saveEstimate(hit, { ...estimate, field: 'East quarter' }, now)
  const miss = checkEstimate(other.state, other.id, 'normal', -10, undefined, now)
  assert.deepEqual({ checked: trackRecord(miss.estimates).checked, hits: trackRecord(miss.estimates).hits }, { checked: 2, hits: 1 })
  assert.match(trackRecord(miss.estimates).text, /1 of 2 .* inside their range\. Those estimates used example numbers\./)
  // A checked estimate counts as an outcome toward stage 4.
  assert.equal(stage(add(miss, 'history_viewed', 'history_viewed', 'question_asked', 'source_opened', 'risk_viewed', 'trial_saved')), 4)
  assert.equal(forget(miss, 'signals').estimates.length, 2)
  assert.equal(forget(miss, 'all').estimates.length, 0)
})

test('the prompt never blocks requests, names the current stage, and keeps the privacy promise', () => {
  const text = promptSection(evaluate(initialState(), DEFAULT_RULES))
  assert.match(text, /Never refuse, delay or water down a request/)
  assert.match(text, /Stage 1 of 4, "Show what happened"/)
  assert.match(text, /Do not mention this guideline/)
  assert.match(text, /never shared with buyers, lenders or insurers/)
  assert.match(promptSection(evaluate(add(initialState(), 'history_viewed', 'history_viewed', 'question_asked', 'source_opened', 'risk_viewed'), DEFAULT_RULES)), /Stage 3 of 4, "Suggest a small trial": You may suggest, at most once/)
})

test('trust records persist atomically and an invalid file is preserved', async () => {
  const home = await mkdtemp(join(tmpdir(), 'native-trust-'))
  try {
    const file = join(home, 'trust.json')
    const records = TrustRecords.open(file, join(home, 'packets'))
    await records.change(s => ({ ...s, pace: 'quiet' }))
    assert.equal(TrustRecords.open(file, home).snapshot().pace, 'quiet')
    await assert.rejects(records.change(s => ({ ...s, pace: 'loud' as 'quiet' })))
    assert.equal(TrustRecords.open(file, home).snapshot().pace, 'quiet')
    await writeFile(file, 'corrupt')
    assert.throws(() => TrustRecords.open(file, home), /preserved/)
  } finally { await rm(home, { recursive: true, force: true }) }
})

test('evidence check: no source, no number; examples are labeled, not blocked', () => {
  const ok = { summary: 's', sources: [{ id: 'a', title: 'A' }], figures: [{ label: 'x', value: 1, unit: 'USD/acre', low: 0, high: 2, method: 'm', sources: ['a'] }] }
  assert.deepEqual(checkEvidence(ok), [])
  assert.deepEqual(asEvidence(JSON.stringify(ok)), ok)
  assert.equal(asEvidence('not json'), undefined)
  const bad = { ...ok, figures: [{ label: 'y', value: 1, unit: 'USD', sources: ['missing'], example: true }] }
  const problems = checkEvidence(bad).map(i => i.problem)
  assert.deepEqual(problems.sort(), ['example number', 'no method', 'no range', 'unknown source'])
  assert.equal(seriousIssues(checkEvidence(bad)).length, 3)
})

test('risk check reports dry-year dollars, how often dry years came, and blockers for new crops only', () => {
  const r = riskCheck({ field: 'North pivot', acres: 126, current: ['corn', 'corn', 'soybean'], proposed: ['corn', 'sorghum', 'soybean'], dryYears: 3, ofYears: 5 }, model)
  const [normal, dry, average, worst] = r.figures
  const normalDelta = (150 + 70 + 110) / 3 - (150 + 150 + 110) / 3
  const dryDelta = (-20 + 40 + 30) / 3 + 15 - (-20 - 20 + 30) / 3
  assert.equal(normal!.value, Math.round(normalDelta))
  assert.equal(dry!.value, Math.round(dryDelta))
  assert.equal(average!.value, Math.round(0.6 * dryDelta + 0.4 * normalDelta))
  assert.ok(average!.sources?.includes('history'))
  assert.equal(worst!.value, Math.round(Math.min(normalDelta, dryDelta) * 126))
  assert.ok(r.figures.every(f => f.example === true))
  assert.equal(r.blockers.length, 2)
  assert.match(r.summary, /Dry years came 3 of the last 5/)
  assert.deepEqual(seriousIssues(checkEvidence(r)), [])
  assert.deepEqual(r.estimate.dry, { value: dry!.value, low: dry!.low, high: dry!.high })
  assert.equal(riskCheck({ field: 'F', acres: 1, current: ['Corn'], proposed: ['soybeans'] }, model).figures.length, 3)
  assert.throws(() => riskCheck({ field: 'F', acres: 1, current: ['corn'], proposed: ['quinoa'] }, model), /Unknown crop/)
  assert.throws(() => riskCheck({ field: 'F', acres: 1, current: ['corn'], proposed: ['wheat'], dryYears: 6, ofYears: 5 }, model), /cannot exceed/)
  const real = riskCheck({ field: 'F', acres: 1, current: ['corn'], proposed: ['wheat'] }, { ...model, cropsAreExamples: false })
  assert.ok(real.figures.every(f => f.example === undefined && f.sources?.includes('budgets')))
})

test('agronomist packet includes only the chosen fields, marks examples, and states the track record', () => {
  const log = new ResultLog(10)
  log.add('risk_check', { field: 'North pivot' }, riskCheck({ field: 'North pivot', acres: 126, current: ['corn'], proposed: ['corn', 'soybean'] }, model))
  log.add('risk_check', { field: 'East quarter' }, riskCheck({ field: 'East quarter', acres: 160, current: ['wheat'], proposed: ['sorghum'] }, model))
  const chosen = log.select(['north pivot'])
  assert.equal(chosen.length, 1)
  const packet = renderPacket(chosen, now, 'No estimates checked against a real season yet.')
  assert.match(packet, /North pivot/)
  assert.doesNotMatch(packet, /East quarter/)
  assert.match(packet, /\(EXAMPLE\)/)
  assert.match(packet, /track record on this farm: No estimates checked/)
  assert.match(packet, /Reviewed by/)
})
