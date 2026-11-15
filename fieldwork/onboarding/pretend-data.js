/**
 * Every invented value the tools return while the pretend switch is on.
 *
 * These numbers are made up for the demo and match the Fieldwork mockup.
 * Nothing here was measured.
 *
 * Two notes differ from the mockup on purpose, because the listed sources
 * cannot support the mockup's wording: 2022 water no longer says
 * "groundwater down 2.1 feet", and 2022 topsoil no longer says "mostly wind".
 */
import { ESTIMATED, PROBLEMS, REGION, SEEN, detectRotation } from './history.js'

/** How sure each problem's finding is in the mockup. */
export const SURE = { droughtHeat: SEEN, water: SEEN, topsoil: ESTIMATED, salt: REGION, costs: REGION }

/** The one pretend field: a 126-acre irrigated circle in Finney County, Kansas. */
export const FIELD = {
  fieldId: 'finney-ks-126',
  acres: 126,
  county: 'Finney',
  state: 'Kansas',
  irrigated: true,
  soilType: 'Richfield silt loam',
  slopePercent: 1,
  shape: {
    type: 'circle',
    center: { latitude: 37.9842, longitude: -100.8653 },
    radiusFeet: 1322,
  },
}

const F = 'fine'
const W = 'watch'
const B = 'bad'

/** The history grid: [year, crop, droughtHeat, water, topsoil, salt, costs]. */
const GRID = [
  [2016, 'corn', F, W, F, F, F],
  [2017, 'corn', F, W, W, F, F],
  [2018, 'soybean', W, W, F, F, F],
  [2019, 'corn', F, F, F, F, F],
  [2020, 'corn', B, B, W, F, F],
  [2021, 'soybean', W, W, F, F, W],
  [2022, 'corn', B, B, W, F, B],
  [2023, 'corn', B, B, B, F, B],
  [2024, 'soybean', W, B, W, F, W],
  [2025, 'corn', F, W, F, F, W],
]

const reading = (name, value, unit, sure, comparedWith = null) => ({ name, value, unit, sure, comparedWith })

/** Readings behind a year's marks. Only 2022 has them so far. */
const READINGS = {
  2022: {
    droughtHeat: {
      readings: [
        reading('season rain', 9, 'inches', SEEN, { label: 'usual', value: 16, unit: 'inches' }),
        reading('hot days', 41, 'days', SEEN),
      ],
      note: null,
    },
    water: { readings: [reading('water used', 24, 'inches', SEEN)], note: 'The region\'s stored water fell.' },
    topsoil: { readings: [reading('soil lost', 6.4, 'tons an acre', ESTIMATED)], note: 'Counts soil moved by rain only, not by wind.' },
    salt: { readings: [reading('salt in the soil', 'low', null, REGION)], note: 'No change' },
    costs: { readings: [reading('fertilizer cost', 171, 'dollars an acre', REGION)], note: 'Ten-year high' },
  },
}

/** The pretend history in the same shape the real calculation returns. */
export function pretendHistory(corrections) {
  const problems = PROBLEMS.filter(p => FIELD.irrigated || (p !== 'water' && p !== 'salt'))
  const years = GRID.map(([year, mapCrop, ...levels]) => {
    const fix = corrections.years?.[year]
    return {
      year,
      crop: fix?.crop ?? mapCrop,
      cropSource: fix?.crop ? 'you told us' : 'crop map',
      secondCrop: null,
      farmerNotes: fix?.notes ?? [],
      results: Object.fromEntries(problems.map(p => [p, {
        level: levels[PROBLEMS.indexOf(p)],
        sure: SURE[p],
        readings: READINGS[year]?.[p]?.readings ?? [],
        note: READINGS[year]?.[p]?.note ?? null,
      }])),
    }
  })
  return { problems, years, rotation: detectRotation(years.map(y => y.crop)), askFarmer: [], windNotCounted: true }
}
