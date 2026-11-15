/** NASA checks: greenness against the same crop's other seasons, per-crop summaries, expected profit. */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { expectedProfit, greennessHits, summariseCrops, type FieldYear } from './rotation-signals-domain.ts'

const year = (y: number, crop: string, unusual: boolean | null, hit: boolean | null): FieldYear => ({ year: y, crop, cropSource: 'crop map', dry: false, hot: false, wetSpring: unusual, unusual, rainShare: 1, springRainShare: 1, greenness: null, usualGreenness: null, hit })

describe('NASA checks', () => {
  test('a peak 10% or more below the same crop\'s other seasons is a hit', () => {
    const r = greennessHits({ 2019: 0.72, 2021: 0.8, 2023: 0.8, 2020: 0.6 }, { 2019: 'corn', 2021: 'corn', 2023: 'corn', 2020: 'soybean' }, 0.1)
    assert.deepEqual(r[2019], { usual: 0.8, hit: true })
    assert.equal(r[2021]!.hit, false)
  })
  test('fewer than two other seasons of the crop gives no reading', () => {
    const r = greennessHits({ 2020: 0.6, 2022: 0.7 }, { 2020: 'soybean', 2022: 'soybean' }, 0.1)
    assert.deepEqual(r[2020], { usual: null, hit: null })
  })
  test('per crop: unusual seasons, readings and hits', () => {
    const s = summariseCrops([year(2019, 'corn', true, true), year(2020, 'corn', false, false), year(2021, 'soybean', true, null), year(2022, 'unknown', true, null)])
    assert.deepEqual(s, [{ crop: 'corn', unusualSeasons: [2019], withGreenness: 1, hits: [2019] }, { crop: 'soybean', unusualSeasons: [2021], withGreenness: 0, hits: [] }])
  })
  test('expected profit weights the two years by the share', () => {
    assert.equal(expectedProfit(100, 40, 0.25), 85)
  })
})
