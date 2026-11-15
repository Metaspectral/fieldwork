/** Types for `settings.js`: the field-history thresholds that plugin code reads. */
import type { GreennessSettings } from './hls.js'

/** The settings plugin code reads; the full object has more groups. */
export const SETTINGS: {
  years: number
  climateYears: number
  minYearsToCompare: number
  crop: { minShare: number; samplePoints: number; defaultSeason: [number, number]; defaultHotDayF: number }
  droughtHeat: { dryRainShare: number; hotTopShare: number; greennessDrop: number }
  wetSpring: { months: [number, number]; wetRainShare: number }
  seasonOdds: { earlier: [number, number]; moreOftenRatio: number; moreOftenExtraSeasons: number }
  greenness: GreennessSettings
}
