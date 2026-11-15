// The per-season weather record and the earlier-against-recent counts.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { seasonOdds, weatherRecord } from '../weather-record.js'

/** Daily weather from 1951 to `last`: 2 mm of rain and 80°F every day, with per-year overrides by month. */
function weather(last, override = () => null) {
  const start = new Date('1951-01-01T00:00:00Z'), rainMm = [], tmaxC = []
  for (const d = new Date(start); d.getUTCFullYear() <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const o = override(d.getUTCFullYear(), d.getUTCMonth() + 1)
    rainMm.push(o?.rainMm ?? 2); tmaxC.push(o?.tmaxC ?? (80 - 32) * 5 / 9)
  }
  return { start: '1951-01-01', rainMm, tmaxC }
}

describe('weather record', () => {
  test('a normal year is not flagged', () => {
    const [r] = weatherRecord(weather(2000), 'corn', 2000, 2000)
    assert.deepEqual([r.dry, r.hot, r.wetSpring, r.unusual], [false, false, false, false])
    assert.deepEqual(r.climateYears, [1971, 2000])
  })
  test('dry: May to September rain under 75% of the 30-year average', () => {
    const [dry] = weatherRecord(weather(2000, (y, m) => y === 2000 && m >= 5 && m <= 9 ? { rainMm: 1.4 } : null), 'corn', 2000, 2000)
    const [notDry] = weatherRecord(weather(2000, (y, m) => y === 2000 && m >= 5 && m <= 9 ? { rainMm: 1.6 } : null), 'corn', 2000, 2000)
    assert.equal(dry.dry, true); assert.equal(dry.unusual, true); assert.equal(notDry.dry, false)
  })
  test('wet spring: April to June rain over 125% of the 30-year average', () => {
    const [wet] = weatherRecord(weather(2000, (y, m) => y === 2000 && m >= 4 && m <= 6 ? { rainMm: 2.6 } : null), 'soybean', 2000, 2000)
    const [notWet] = weatherRecord(weather(2000, (y, m) => y === 2000 && m >= 4 && m <= 6 ? { rainMm: 2.4 } : null), 'soybean', 2000, 2000)
    assert.equal(wet.wetSpring, true); assert.equal(notWet.wetSpring, false)
  })
  test('hot: hot days in the top fifth of 30 years', () => {
    const hot = (y, m) => y === 2000 && m === 7 ? { tmaxC: 36 } : null
    const [r] = weatherRecord(weather(2000, hot), 'corn', 2000, 2000)
    assert.equal(r.hot, true); assert.equal(r.hotDays, 31)
  })
  test('a short record uses its first 30 years as the normal', () => {
    const w = weather(2000); const days = Math.round((Date.parse('1981-01-01') - Date.parse('1951-01-01')) / 864e5)
    const [r] = weatherRecord({ start: '1981-01-01', rainMm: w.rainMm.slice(days), tmaxC: w.tmaxC.slice(days) }, 'corn', 1985, 1985)
    assert.deepEqual(r.climateYears, [1981, 2010])
  })
  test('missing weather gives unknown flags, not a guess', () => {
    const w = weather(2000); w.rainMm = w.rainMm.map(() => null)
    const [r] = weatherRecord(w, 'corn', 2000, 2000)
    assert.equal(r.unusual, null)
  })
})

describe('season odds', () => {
  const flagged = years => years.map(year => ({ year, dry: false, hot: false, wetSpring: false, unusual: false }))
  const record = (earlierHits, recentHits) => flagged([...Array(45)].map((_, i) => 1981 + i)).map(r => ({ ...r, unusual: earlierHits.includes(r.year) || recentHits.includes(r.year) }))
  test('"more often" needs 1.5 times the share and 2 more seasons than expected', () => {
    const odds = seasonOdds(record([1985, 1990, 1995, 2000], [2012, 2015, 2018, 2021, 2024]), 2025).unusual
    assert.equal(odds.earlier.count, 4); assert.equal(odds.recent.count, 5); assert.equal(odds.moreOften, true)
  })
  test('a small rise is reported as counts only', () => {
    const odds = seasonOdds(record([1985, 1990, 1995, 2000], [2012, 2018, 2024]), 2025).unusual
    assert.equal(odds.moreOften, false)
  })
})
