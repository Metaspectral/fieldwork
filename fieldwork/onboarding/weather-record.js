/**
 * The weather record, one season at a time: dry, hot and wet-spring flags for every
 * harvest year, using the same rules and settings as the field history.
 *
 * Plain arithmetic on NASA POWER daily data handed in. Nothing here fetches.
 * Weather is for an area about 50 km across, not the field.
 */
import { CROP_TABLE } from './crops.js'
import { indexWeather, isTopShare, seasonMonths } from './history.js'
import { SETTINGS } from './settings.js'

const mean = list => list.reduce((a, b) => a + b, 0) / list.length
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** Rain (inches) and hot days over [year, month] pairs, or null when any month has under 20 days of data. */
function over(index, months, hotDayF) {
  let rain = 0, hotDays = 0
  for (const [year, month] of months) {
    const data = index.get(`${year}-${month}`)
    if (!data || data.days < 20) return null
    rain += data.rainInches
    hotDays += data.hottestF.filter(t => t >= hotDayF).length
  }
  return { rain, hotDays }
}

/**
 * Flag one harvest year against the 30 years ending with it.
 * Returns null flags where the data is missing or fewer than `minYearsToCompare` years exist.
 */
export function seasonFlags(index, crop, year, s = SETTINGS, firstDataYear = -Infinity) {
  const hotDayF = CROP_TABLE[crop]?.hotDayF ?? s.crop.defaultHotDayF
  // The 30 years ending with this one; where the record is shorter, its first 30 years.
  const start = Math.max(year - s.climateYears + 1, firstDataYear)
  const climate = range(start, Math.max(year, start + s.climateYears - 1))
  const season = over(index, seasonMonths(crop, year, s), hotDayF)
  const usual = climate.map(y => over(index, seasonMonths(crop, y, s), hotDayF)).filter(Boolean)
  const [first, last] = s.wetSpring.months
  const springOf = y => over(index, range(first, last).map(m => [y, m]), Infinity)?.rain ?? null
  const spring = springOf(year)
  const usualSprings = climate.map(springOf).filter(v => v !== null)
  const enough = usual.length >= s.minYearsToCompare
  const usualRain = enough ? mean(usual.map(u => u.rain)) : null
  const usualSpring = usualSprings.length >= s.minYearsToCompare ? mean(usualSprings) : null
  const dry = season && usualRain !== null ? season.rain < s.droughtHeat.dryRainShare * usualRain : null
  const hot = season && enough ? season.hotDays > 0 && isTopShare(season.hotDays, usual.map(u => u.hotDays), s.droughtHeat.hotTopShare) : null
  const wetSpring = spring !== null && usualSpring !== null ? spring > s.wetSpring.wetRainShare * usualSpring : null
  const known = [dry, hot, wetSpring].filter(v => v !== null)
  return {
    year, crop,
    rain: season?.rain ?? null, usualRain, hotDays: season?.hotDays ?? null, hotDayF,
    springRain: spring, usualSpringRain: usualSpring,
    dry, hot, wetSpring,
    unusual: known.length ? known.some(Boolean) : null,
    climateYears: [climate[0], climate.at(-1)], yearsCompared: usual.length,
  }
}

/** Flags for every harvest year in [firstYear, lastYear] for one crop. */
export function weatherRecord(weather, crop, firstYear, lastYear, s = SETTINGS) {
  const index = indexWeather(weather)
  const [y, m, d] = weather.start.split('-').map(Number)
  const firstDataYear = m === 1 && d === 1 ? y : y + 1
  return range(firstYear, lastYear).map(year => seasonFlags(index, crop, year, s, firstDataYear))
}

/**
 * How often unusual seasons occurred: the earlier period against the recent one.
 * Years with unknown flags are left out and counted separately.
 * "More often" is said only if the agreed count rule holds; otherwise only the counts are shown.
 */
export function seasonOdds(record, lastYear, s = SETTINGS) {
  const [e0, e1] = s.seasonOdds.earlier
  const count = (from, to, key) => {
    const years = record.filter(r => r.year >= from && r.year <= to && r[key] !== null)
    const hits = years.filter(r => r[key]).map(r => r.year)
    return { from, to, known: years.length, count: hits.length, share: years.length ? hits.length / years.length : null, years: hits }
  }
  const compare = key => {
    const earlier = count(e0, e1, key), recent = count(e1 + 1, lastYear, key)
    const expected = earlier.share === null ? null : earlier.share * recent.known
    const moreOften = earlier.share !== null && recent.share !== null && expected !== null
      && recent.share >= s.seasonOdds.moreOftenRatio * earlier.share
      && recent.count - expected >= s.seasonOdds.moreOftenExtraSeasons
    return { earlier, recent, moreOften }
  }
  return { unusual: compare('unusual'), dry: compare('dry'), hot: compare('hot'), wetSpring: compare('wetSpring') }
}
