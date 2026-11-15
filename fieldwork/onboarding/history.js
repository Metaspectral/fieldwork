/**
 * Field history rules: turn gathered data into crops, levels, readings and ranked risks.
 *
 * Everything here is plain arithmetic on data handed in. Nothing here fetches.
 * Missing data gives "no reading"; a gap is never filled with a guess.
 */
import { CROP_TABLE } from './crops.js'
import { SETTINGS } from './settings.js'

export const PROBLEMS = ['droughtHeat', 'water', 'topsoil', 'salt', 'costs']
export const NO_READING = 'no reading'
export const SEEN = 'seen on your field'
export const ESTIMATED = 'estimated for your field'
export const REGION = 'true for your region'

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places
const mean = list => list.reduce((a, b) => a + b, 0) / list.length
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const reading = (name, value, unit, sure, comparedWith = null) => ({ name, value, unit, sure: value === null ? null : sure, comparedWith })
const compared = (label, value, unit) => ({ label, value, unit })
const none = () => ({ level: NO_READING, sure: null, readings: [], note: null })

// ── Small rules ──────────────────────────────────────────────────────────────

/** True when fewer than `share` of the values are above this one. */
export function isTopShare(value, all, share) {
  return all.filter(v => v > value).length < Math.round(all.length * share)
}

/** The smallest value that still counts as inside the top share. */
export function topShareStart(all, share) {
  const sorted = [...all].sort((a, b) => b - a)
  return sorted[Math.max(0, Math.round(all.length * share) - 1)]
}

/** Bad if two or more signals are true, watch if one, fine if none. Unknown signals are skipped. */
export function levelFromSignals(signals) {
  const known = signals.filter(s => s !== null)
  if (known.length === 0) return NO_READING
  const hits = known.filter(Boolean).length
  return hits >= 2 ? 'bad' : hits === 1 ? 'watch' : 'fine'
}

/** The [year, month] pairs a crop grows in for a harvest year. */
export function seasonMonths(crop, year, s = SETTINGS) {
  const [first, last] = CROP_TABLE[crop]?.season ?? s.crop.defaultSeason
  if (first <= last) return range(first, last).map(m => [year, m])
  return [...range(first, 12).map(m => [year - 1, m]), ...range(1, last).map(m => [year, m])]
}

/** Shortest repeating pattern in the crops, or null when none repeats at least twice. */
export function detectRotation(crops) {
  if (crops.length < 2 || crops.includes('unknown')) return null
  for (let length = 1; length <= Math.floor(crops.length / 2); length++) {
    if (crops.every((crop, i) => i < length || crop === crops[i - length])) return { crops: crops.slice(0, length), repeats: true }
  }
  return null
}

/** Soil lost to rain in tons an acre a year (Revised Universal Soil Loss Equation). Rain only, not wind. */
export function soilLoss({ yearlyRainInches, erodibility, slopePercent, cover }, s = SETTINGS) {
  // Rain factor from yearly rain (Renard and Freimund 1994), converted to US units.
  const rainFactor = 0.0483 * (yearlyRainInches * 25.4) ** 1.61 / 17.02
  const angle = Math.atan(slopePercent / 100)
  const exponent = slopePercent < 1 ? 0.2 : slopePercent < 3 ? 0.3 : slopePercent < 5 ? 0.4 : 0.5
  const slopeFactor = (s.topsoil.slopeLengthFeet / 72.6) ** exponent * (65.41 * Math.sin(angle) ** 2 + 4.56 * Math.sin(angle) + 0.065)
  return rainFactor * erodibility * slopeFactor * cover * s.topsoil.supportPractice
}

// ── Level rules, one per problem ─────────────────────────────────────────────

/** Dry, hot, and crop hit: bad if two or more are true, watch if one. */
export function droughtHeatResult({ rain, usualRain, hotDays, hotDaysAllYears, hotDayF, greenness, usualGreenness }, s = SETTINGS) {
  const enoughYears = hotDaysAllYears.length >= s.minYearsToCompare
  const dry = rain !== null && usualRain !== null ? rain < s.droughtHeat.dryRainShare * usualRain : null
  const hot = hotDays !== null && enoughYears ? hotDays > 0 && isTopShare(hotDays, hotDaysAllYears, s.droughtHeat.hotTopShare) : null
  const hit = greenness !== null && usualGreenness !== null ? greenness <= (1 - s.droughtHeat.greennessDrop) * usualGreenness : null
  const level = levelFromSignals([dry, hot, hit])
  if (level === NO_READING) return none()
  // Weather is for the wider area; only greenness is field-sized.
  return {
    level,
    sure: hit !== null ? SEEN : REGION,
    readings: [
      reading('season rain', rain === null ? null : round(rain), 'inches', REGION,
        usualRain === null ? null : compared('30-year average', round(usualRain), 'inches')),
      reading('hot days', hotDays, `days at or above ${hotDayF}°F`, REGION,
        enoughYears ? compared('the top fifth of 30 years starts at', topShareStart(hotDaysAllYears, s.droughtHeat.hotTopShare), 'days') : null),
      reading('crop greenness at its peak', greenness === null ? null : round(greenness, 2), 'on a scale of 0 to 1', SEEN,
        usualGreenness === null ? null : compared('this field\'s usual for the crop', round(usualGreenness, 2), 'on a scale of 0 to 1')),
    ],
    note: null,
  }
}

/** Bad if the shortfall is in the top third of the field's years and the region's stored water fell. Watch if one is true. */
export function waterResult({ shortfall, allShortfalls, storedWaterChange }, s = SETTINGS) {
  const enoughYears = allShortfalls.length >= s.minYearsToCompare
  const high = shortfall !== null && enoughYears ? isTopShare(shortfall, allShortfalls, s.water.topShare) : null
  const fell = storedWaterChange !== null ? storedWaterChange < 0 : null
  const level = levelFromSignals([high, fell])
  if (level === NO_READING) return none()
  return {
    level,
    sure: shortfall !== null ? SEEN : REGION,
    readings: [
      reading('water the crop used beyond the rain', shortfall === null ? null : round(shortfall), 'inches', SEEN,
        enoughYears ? compared('the top third of this field\'s years starts at', round(topShareStart(allShortfalls, s.water.topShare)), 'inches') : null),
      reading('the region\'s stored water', fell === null ? null : fell ? 'fell' : 'held or rose', null, REGION, null),
    ],
    note: null,
  }
}

/** Bad above the soil's tolerable loss, watch above half of it. */
export function topsoilResult({ lost, tolerable }, s = SETTINGS) {
  if (lost === null || tolerable === null) return none()
  return {
    level: lost > tolerable ? 'bad' : lost > s.topsoil.watchShareOfTolerable * tolerable ? 'watch' : 'fine',
    sure: ESTIMATED,
    readings: [reading('soil lost', round(lost), 'tons an acre', ESTIMATED, compared('this soil can lose', tolerable, 'tons an acre'))],
    note: 'Counts soil moved by rain only, not by wind.',
  }
}

/** Fine under 2, watch 2 to 4, bad above 4 deciSiemens per metre. */
export function saltResult({ salt }, s = SETTINGS) {
  if (salt === null) return none()
  return {
    level: salt > s.salt.badAbove ? 'bad' : salt >= s.salt.watchFrom ? 'watch' : 'fine',
    sure: REGION,
    readings: [reading('salt in the soil', salt, 'deciSiemens per metre', REGION, compared('watch from', s.salt.watchFrom, 'deciSiemens per metre'))],
    note: 'One reading for the whole period, from the soil record.',
  }
}

/** Against the field's own years: bad in the top third, watch in the middle. */
export function costsResult({ cost, allCosts }, s = SETTINGS) {
  if (cost === null || allCosts.length < s.minYearsToCompare) return none()
  const level = isTopShare(cost, allCosts, s.costs.topShare) ? 'bad'
    : isTopShare(cost, allCosts, s.costs.topShare + s.costs.middleShare) ? 'watch' : 'fine'
  return {
    level,
    sure: REGION,
    readings: [reading('fertilizer cost', Math.round(cost), 'dollars an acre', REGION,
      compared('the top third of this field\'s years starts at', Math.round(topShareStart(allCosts, s.costs.topShare)), 'dollars an acre'))],
    note: null,
  }
}

// ── Weather helpers ──────────────────────────────────────────────────────────

/** Group daily weather by month: key "year-month" → { rainInches, hottestF: [...] }. */
export function indexWeather(weather) {
  const months = new Map()
  const day = new Date(`${weather.start}T00:00:00Z`)
  for (let i = 0; i < weather.rainMm.length; i++) {
    const key = `${day.getUTCFullYear()}-${day.getUTCMonth() + 1}`
    let month = months.get(key)
    if (!month) months.set(key, month = { rainInches: 0, hottestF: [], days: 0 })
    const rain = weather.rainMm[i]
    const hottest = weather.tmaxC[i]
    if (rain !== null && hottest !== null) {
      month.rainInches += rain / 25.4
      month.hottestF.push(hottest * 9 / 5 + 32)
      month.days++
    }
    day.setUTCDate(day.getUTCDate() + 1)
  }
  return months
}

/** Rain and hot days over a set of months, or null when any month has no weather. */
function seasonWeather(index, months, hotDayF) {
  if (!index) return null
  let rain = 0
  let hotDays = 0
  for (const [year, month] of months) {
    const data = index.get(`${year}-${month}`)
    if (!data || data.days < 20) return null
    rain += data.rainInches
    hotDays += data.hottestF.filter(t => t >= hotDayF).length
  }
  return { rain, hotDays }
}

// ── The whole history ────────────────────────────────────────────────────────

/** Problems that apply. Water needs irrigation; salt needs irrigation and a dry climate. */
export function problemsThatApply(field, dryClimate) {
  return PROBLEMS.filter(problem =>
    problem === 'water' ? field.irrigated === true
      : problem === 'salt' ? field.irrigated === true && dryClimate === true
        : true)
}

/**
 * Work out the history from gathered data.
 * @param field - { irrigated, acres }
 * @param raw - { inUS, crops, weather, soil, greenness, waterUse, storedWater, fertilizerPrice }; any part may be null
 * @param corrections - { years: { [year]: { crop?, notes } } }
 * @param years - the years to report, oldest first
 */
export function computeHistory(field, raw, corrections, years, s = SETTINGS) {
  const index = raw.weather ? indexWeather(raw.weather) : null
  const lastYear = years.at(-1)
  const climateYears = range(lastYear - s.climateYears + 1, lastYear)
  const wholeYear = year => seasonWeather(index, range(1, 12).map(m => [year, m]), Infinity)?.rain ?? null

  const yearlyRains = climateYears.map(wholeYear).filter(v => v !== null)
  const usualYearlyRain = yearlyRains.length >= s.minYearsToCompare ? mean(yearlyRains) : null
  const dryClimate = usualYearlyRain === null ? null : usualYearlyRain < s.salt.dryClimateInches
  const problems = problemsThatApply(field, dryClimate)

  // Crops first: the farmer's word beats the crop map.
  const rows = years.map(year => {
    const fix = corrections.years?.[year]
    const mapped = raw.crops?.[year] ?? null
    const farmerNotes = fix?.notes ?? []
    if (fix?.crop) return { year, crop: fix.crop, cropSource: 'you told us', secondCrop: null, farmerNotes }
    if (mapped) return { year, crop: mapped.crop, cropSource: 'crop map', secondCrop: mapped.share < s.crop.minShare ? mapped.secondCrop : null, farmerNotes }
    return { year, crop: 'unknown', cropSource: 'unknown', secondCrop: null, farmerNotes }
  })

  // Numbers for each year, before any level is set.
  const numbers = rows.map(({ year, crop }) => {
    const table = CROP_TABLE[crop] ?? null
    const hotDayF = table?.hotDayF ?? s.crop.defaultHotDayF
    const months = seasonMonths(crop, year, s)
    const season = seasonWeather(index, months, hotDayF)
    const usual = climateYears.map(y => seasonWeather(index, seasonMonths(crop, y, s), hotDayF)).filter(Boolean)
    const sameCropGreenness = rows.filter(r => r.crop === crop).map(r => raw.greenness?.[r.year] ?? null).filter(v => v !== null)
    const used = raw.waterUse ? months.map(([y, m]) => raw.waterUse[`${y}-${m}`] ?? null) : [null]
    const yearlyRain = wholeYear(year)
    const price = raw.fertilizerPrice?.[year] ?? null
    return {
      hotDayF,
      rain: season?.rain ?? null,
      usualRain: usual.length >= s.minYearsToCompare ? mean(usual.map(u => u.rain)) : null,
      hotDays: season?.hotDays ?? null,
      hotDaysAllYears: usual.map(u => u.hotDays),
      greenness: raw.greenness?.[year] ?? null,
      usualGreenness: sameCropGreenness.length >= 2 ? mean(sameCropGreenness) : null,
      shortfall: season && !used.includes(null) ? used.reduce((a, b) => a + b, 0) - season.rain : null,
      storedWaterChange: raw.storedWater?.[year] ?? null,
      lost: table && raw.soil?.erodibility != null && raw.soil?.slopePercent != null && yearlyRain !== null
        ? soilLoss({ yearlyRainInches: yearlyRain, erodibility: raw.soil.erodibility, slopePercent: raw.soil.slopePercent, cover: table.cover }, s)
        : null,
      cost: table && price !== null ? price * table.fertilizerPoundsPerAcre : null,
    }
  })
  const allShortfalls = numbers.map(n => n.shortfall).filter(v => v !== null)
  const allCosts = numbers.map(n => n.cost).filter(v => v !== null)

  const rules = {
    droughtHeat: n => droughtHeatResult(n, s),
    water: n => waterResult({ ...n, allShortfalls }, s),
    topsoil: n => topsoilResult({ lost: n.lost, tolerable: raw.soil?.tolerableLoss ?? null }, s),
    salt: () => saltResult({ salt: raw.soil?.salt ?? null }, s),
    costs: n => costsResult({ cost: n.cost, allCosts }, s),
  }

  const askFarmer = []
  if (rows.some(r => r.crop === 'unknown')) askFarmer.push('crops')
  if (field.irrigated === null || field.irrigated === undefined) askFarmer.push('irrigated')
  if (field.acres === null || field.acres === undefined) askFarmer.push('acres')

  return {
    problems,
    years: rows.map((row, i) => ({ ...row, results: Object.fromEntries(problems.map(p => [p, rules[p](numbers[i])])) })),
    rotation: detectRotation(rows.map(r => r.crop)),
    askFarmer,
    windNotCounted: dryClimate === true,
  }
}

/** Of the crops grown on the field, the one that typically needs the most water. */
export function thirstiestCrop(years) {
  const grown = [...new Set(years.map(y => y.crop))].filter(crop => CROP_TABLE[crop])
  if (grown.length < 2) return null
  return grown.sort((a, b) => CROP_TABLE[b].waterNeedInches - CROP_TABLE[a].waterNeedInches)[0]
}

/**
 * Rank the problems. Score the recent window: 2 for a bad year, 1 for a watch year.
 * Problems seen or estimated on the field come first; region-only problems after.
 * A problem with no reading in any year is left out.
 */
export function rankRisks(history, s = SETTINGS) {
  const recentYears = history.years.slice(-s.recentWindow)
  const earlierYears = history.years.slice(-2 * s.recentWindow, -s.recentWindow)
  const window = (span, problem) => ({
    from: span[0]?.year ?? null,
    to: span.at(-1)?.year ?? null,
    years: span.length,
    badYears: span.filter(y => y.results[problem].level === 'bad').length,
  })
  const risks = history.problems.map((problem, order) => {
    const read = history.years.filter(y => y.results[problem].level !== NO_READING)
    if (read.length === 0) return null
    const levelYears = level => read.filter(y => y.results[problem].level === level).map(y => y.year)
    const score = recentYears.reduce((sum, y) => sum + (s.ranking[y.results[problem].level] ?? 0), 0)
    const regionOnly = read.every(y => y.results[problem].sure === REGION)
    return {
      problem, order, regionOnly, score,
      size: score >= s.ranking.high ? 'high' : score >= s.ranking.medium ? 'medium' : 'low',
      sure: regionOnly ? REGION : read.some(y => y.results[problem].sure === SEEN) ? SEEN : ESTIMATED,
      badYears: levelYears('bad'),
      watchYears: levelYears('watch'),
      recent: window(recentYears, problem),
      earlier: window(earlierYears, problem),
    }
  }).filter(Boolean)
  risks.sort((a, b) => a.regionOnly - b.regionOnly || b.score - a.score || b.badYears.length - a.badYears.length || a.order - b.order)
  return risks.map(({ order: _order, ...risk }, i) => ({ rank: i + 1, ...risk }))
}
