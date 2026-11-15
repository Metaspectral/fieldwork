/** Types for `weather-record.js`: per-season dry, hot and wet-spring flags from NASA POWER daily data. */

/** Daily weather as the onboarding source layer returns it: one value per day from `start`, null when missing. */
export interface DailyWeather { start: string; rainMm: (number | null)[]; tmaxC: (number | null)[] }

/** One harvest year's flags. Rain in inches; null where the data is missing. */
export interface SeasonFlags {
  year: number; crop: string
  rain: number | null; usualRain: number | null; hotDays: number | null; hotDayF: number
  springRain: number | null; usualSpringRain: number | null
  dry: boolean | null; hot: boolean | null; wetSpring: boolean | null; unusual: boolean | null
  climateYears: [number, number]; yearsCompared: number
}

/** Count of flagged seasons over a period. */
export interface PeriodCount { from: number; to: number; known: number; count: number; share: number | null; years: number[] }

/** One flag compared between the earlier and recent periods. */
export interface FlagOdds { earlier: PeriodCount; recent: PeriodCount; moreOften: boolean }

/** Every flag's odds. */
export interface SeasonOdds { unusual: FlagOdds; dry: FlagOdds; hot: FlagOdds; wetSpring: FlagOdds }

/**
 * Flags for every harvest year in a range, for one crop.
 * @param weather - Daily weather covering at least 30 years before `firstYear`.
 * @param crop - Crop-table name; unknown crops use the default season.
 * @param firstYear - First harvest year.
 * @param lastYear - Last harvest year.
 * @returns One entry per year, oldest first.
 */
export function weatherRecord(weather: DailyWeather, crop: string, firstYear: number, lastYear: number): SeasonFlags[]

/**
 * Earlier against recent counts of each flag, with the agreed "more often" rule.
 * @param record - Output of `weatherRecord`.
 * @param lastYear - Last year of the recent period.
 * @returns Counts, shares and the "more often" verdict per flag.
 */
export function seasonOdds(record: SeasonFlags[], lastYear: number): SeasonOdds
