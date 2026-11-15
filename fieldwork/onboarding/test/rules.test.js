// Each level rule, with a value on each side of its threshold.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  costsResult, detectRotation, droughtHeatResult, levelFromSignals, rankRisks, saltResult, seasonMonths, soilLoss, topsoilResult, waterResult,
} from '../history.js'
import { samplePoints, toCropMapGrid } from '../sources.js'

const oneToTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const thirtyYears = Array.from({ length: 30 }, (_, i) => i) // 0..29 hot days
const quiet = { rain: 10, usualRain: 10, hotDays: 0, hotDaysAllYears: thirtyYears, hotDayF: 95, greenness: null, usualGreenness: null }

describe('drought and heat', () => {
  test('dry: rain under 75% of average', () => {
    assert.equal(droughtHeatResult({ ...quiet, rain: 7.4 }).level, 'watch')
    assert.equal(droughtHeatResult({ ...quiet, rain: 7.6 }).level, 'fine')
  })
  test('hot: hot days in the top fifth of 30 years', () => {
    assert.equal(droughtHeatResult({ ...quiet, hotDays: 24 }).level, 'watch')
    assert.equal(droughtHeatResult({ ...quiet, hotDays: 23 }).level, 'fine')
  })
  test('crop hit: greenness 10% below usual', () => {
    assert.equal(droughtHeatResult({ ...quiet, greenness: 0.72, usualGreenness: 0.8 }).level, 'watch')
    assert.equal(droughtHeatResult({ ...quiet, greenness: 0.73, usualGreenness: 0.8 }).level, 'fine')
  })
  test('bad if two or more are true', () => {
    assert.equal(droughtHeatResult({ ...quiet, rain: 7, hotDays: 29 }).level, 'bad')
  })
  test('seen on the field only when greenness exists', () => {
    assert.equal(droughtHeatResult(quiet).sure, 'true for your region')
    assert.equal(droughtHeatResult({ ...quiet, greenness: 0.8, usualGreenness: 0.8 }).sure, 'seen on your field')
  })
  test('no weather and no images gives no reading', () => {
    const result = droughtHeatResult({ ...quiet, rain: null, usualRain: null, hotDays: null, hotDaysAllYears: [] })
    assert.deepEqual([result.level, result.sure], ['no reading', null])
  })
})

describe('water', () => {
  const base = { allShortfalls: oneToTen }
  test('bad needs a top-third shortfall and falling stored water', () => {
    assert.equal(waterResult({ ...base, shortfall: 8, storedWaterChange: -1 }).level, 'bad')
    assert.equal(waterResult({ ...base, shortfall: 7, storedWaterChange: -1 }).level, 'watch')
    assert.equal(waterResult({ ...base, shortfall: 8, storedWaterChange: 1 }).level, 'watch')
    assert.equal(waterResult({ ...base, shortfall: 7, storedWaterChange: 1 }).level, 'fine')
  })
  test('each reading carries its own "how sure"', () => {
    const { readings } = waterResult({ ...base, shortfall: 8, storedWaterChange: -1 })
    assert.deepEqual(readings.map(r => r.sure), ['seen on your field', 'true for your region'])
  })
  test('nothing known gives no reading', () => {
    assert.equal(waterResult({ allShortfalls: [], shortfall: null, storedWaterChange: null }).level, 'no reading')
  })
})

describe('topsoil', () => {
  test('bad above the tolerable loss, watch above half of it', () => {
    assert.equal(topsoilResult({ lost: 5.1, tolerable: 5 }).level, 'bad')
    assert.equal(topsoilResult({ lost: 4.9, tolerable: 5 }).level, 'watch')
    assert.equal(topsoilResult({ lost: 2.6, tolerable: 5 }).level, 'watch')
    assert.equal(topsoilResult({ lost: 2.4, tolerable: 5 }).level, 'fine')
  })
  test('says it does not count wind', () => {
    assert.match(topsoilResult({ lost: 1, tolerable: 5 }).note, /not by wind/)
  })
  test('more rain, slope or bare ground loses more soil', () => {
    const base = { yearlyRainInches: 20, erodibility: 0.3, slopePercent: 2, cover: 0.2 }
    const loss = soilLoss(base)
    assert.ok(loss > 0)
    assert.ok(soilLoss({ ...base, yearlyRainInches: 30 }) > loss)
    assert.ok(soilLoss({ ...base, slopePercent: 6 }) > loss)
    assert.ok(soilLoss({ ...base, cover: 0.3 }) > loss)
  })
})

describe('salt', () => {
  test('fine under 2, watch 2 to 4, bad above 4', () => {
    assert.equal(saltResult({ salt: 1.9 }).level, 'fine')
    assert.equal(saltResult({ salt: 2 }).level, 'watch')
    assert.equal(saltResult({ salt: 4 }).level, 'watch')
    assert.equal(saltResult({ salt: 4.1 }).level, 'bad')
    assert.equal(saltResult({ salt: null }).level, 'no reading')
  })
})

describe('costs', () => {
  test('bad in the top third of the field\'s years, watch in the middle', () => {
    const level = cost => costsResult({ cost, allCosts: oneToTen }).level
    assert.equal(level(8), 'bad')
    assert.equal(level(7), 'watch')
    assert.equal(level(4), 'watch')
    assert.equal(level(3), 'fine')
  })
  test('too few years to compare gives no reading', () => {
    assert.equal(costsResult({ cost: 3, allCosts: [1, 2, 3] }).level, 'no reading')
  })
})

describe('ranking', () => {
  const history = levels => ({
    problems: Object.keys(levels),
    years: Array.from({ length: 10 }, (_, i) => ({
      year: 2016 + i,
      results: Object.fromEntries(Object.entries(levels).map(([p, [sure, marks]]) => [p, { level: marks[i], sure }])),
    })),
  })
  const marks = recent => ['fine', 'fine', 'fine', 'fine', 'fine', ...recent]
  test('high is 6 or more, medium is 3 to 5, low is under 3', () => {
    const risks = rankRisks(history({
      droughtHeat: ['seen on your field', marks(['bad', 'bad', 'bad', 'fine', 'fine'])], // 6
      topsoil: ['estimated for your field', marks(['bad', 'bad', 'watch', 'fine', 'fine'])], // 5
      water: ['seen on your field', marks(['bad', 'watch', 'fine', 'fine', 'fine'])], // 3
      costs: ['seen on your field', marks(['bad', 'fine', 'fine', 'fine', 'fine'])], // 2
    }))
    assert.deepEqual(risks.map(r => [r.problem, r.score, r.size]), [['droughtHeat', 6, 'high'], ['topsoil', 5, 'medium'], ['water', 3, 'medium'], ['costs', 2, 'low']])
  })
  test('region-only problems come after field ones, whatever their score', () => {
    const risks = rankRisks(history({
      costs: ['true for your region', marks(['bad', 'bad', 'bad', 'bad', 'bad'])],
      topsoil: ['estimated for your field', marks(['watch', 'fine', 'fine', 'fine', 'fine'])],
    }))
    assert.deepEqual(risks.map(r => r.problem), ['topsoil', 'costs'])
  })
  test('only the last five years score', () => {
    const [risk] = rankRisks(history({ topsoil: ['estimated for your field', ['bad', 'bad', 'bad', 'bad', 'bad', 'fine', 'fine', 'fine', 'fine', 'fine']] }))
    assert.equal(risk.score, 0)
    assert.deepEqual([risk.recent.badYears, risk.earlier.badYears], [0, 5])
  })
})

describe('helpers', () => {
  test('signals: two true is bad, one is watch, unknown is skipped', () => {
    assert.equal(levelFromSignals([true, true, null]), 'bad')
    assert.equal(levelFromSignals([true, false, null]), 'watch')
    assert.equal(levelFromSignals([false, null, null]), 'fine')
    assert.equal(levelFromSignals([null, null]), 'no reading')
  })
  test('rotation is the shortest repeating pattern', () => {
    assert.deepEqual(detectRotation(['corn', 'corn', 'soybean', 'corn', 'corn', 'soybean', 'corn', 'corn', 'soybean', 'corn']), { crops: ['corn', 'corn', 'soybean'], repeats: true })
    assert.deepEqual(detectRotation(['wheat', 'sorghum', 'wheat', 'sorghum']), { crops: ['wheat', 'sorghum'], repeats: true })
    assert.equal(detectRotation(['corn', 'wheat', 'soybean', 'sorghum']), null)
    assert.equal(detectRotation(['corn', 'unknown', 'corn', 'corn']), null)
  })
  test('wheat\'s season starts the autumn before', () => {
    assert.deepEqual(seasonMonths('wheat', 2022).slice(0, 4), [[2021, 10], [2021, 11], [2021, 12], [2022, 1]])
    assert.deepEqual(seasonMonths('corn', 2022), [[2022, 5], [2022, 6], [2022, 7], [2022, 8], [2022, 9]])
  })
  test('crop map grid matches the published centre of the projection', () => {
    const origin = toCropMapGrid(23, -96)
    assert.ok(Math.abs(origin.x) < 1 && Math.abs(origin.y) < 1)
    const kansas = toCropMapGrid(37.9842, -100.8653)
    assert.ok(kansas.x < -400000 && kansas.x > -450000 && kansas.y > 1650000 && kansas.y < 1700000)
  })
  test('sample points stay inside the field', () => {
    const points = samplePoints(38, -100, 126, 9)
    const radius = Math.sqrt(126 * 4046.86 / Math.PI)
    assert.equal(points.length, 9)
    assert.ok(points.every(p => Math.hypot(p.x - points[0].x, p.y - points[0].y) < radius))
  })
})
