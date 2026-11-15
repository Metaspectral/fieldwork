/** NASA checks for rotation plans: pure summaries shared by the Host plugin and the page. No fetching. */

/** One flag counted over the earlier and recent periods. */
export interface PeriodCount { from: number; to: number; known: number; count: number; share: number | null; years: number[] }
/** Earlier against recent for one flag; `moreOften` follows the agreed count rule. */
export interface FlagOdds { earlier: PeriodCount; recent: PeriodCount; moreOften: boolean }
/** Flags compared: any unusual season, dry, hot, wet spring. */
export type Flag = 'unusual' | 'dry' | 'hot' | 'wetSpring'

/** One past season on the field. */
export interface FieldYear {
  year: number; crop: string; cropSource: 'crop map' | 'farmer' | 'unknown'
  dry: boolean | null; hot: boolean | null; wetSpring: boolean | null; unusual: boolean | null
  /** Season rain and April–June rain as a share of the 30-year average. */
  rainShare: number | null; springRainShare: number | null
  /** Peak greenness (NDVI, 0 to 1) and the field's usual peak for the same crop in its other seasons. */
  greenness: number | null; usualGreenness: number | null
  /** True when the peak is at least the agreed drop below usual. */
  hit: boolean | null
}

/** What unusual seasons did to one crop on this field. */
export interface CropSummary { crop: string; unusualSeasons: number[]; withGreenness: number; hits: number[] }

/** A saved NASA check for one field. */
export interface NasaCheck {
  fieldId: string; fieldName: string; demo: boolean; checkedAt: string
  /** Which outline was read: the field's own boundary, onboarding's circle, or the hand-drawn test outline. */
  outline: 'boundary' | 'circle' | 'test'
  location: { latitude: number; longitude: number; areaHa: number }
  lastYear: number
  /** Odds for the field's main crop season. */
  oddsCrop: string
  odds: Record<Flag, FlagOdds>
  years: FieldYear[]
  crops: CropSummary[]
  greenness: { connected: boolean; seasons: number; scenesFound: number; scenesUsed: number; failures: number; note: string | null }
  sources: { name: string; address: string; detail: string }[]
  limits: string[]
}

/** Earthdata connection and saved checks, as the page sees them. */
export interface NasaStatus { connected: boolean; checks: NasaCheck[] }

/**
 * Expected profit per acre from the farmer's own normal-year and unusual-year figures.
 * @param normal - Normal-year profit per acre.
 * @param unusual - Unusual-year profit per acre.
 * @param share - Share of unusual seasons, 0 to 1.
 * @returns (1 − share) × normal + share × unusual.
 */
export function expectedProfit(normal: number, unusual: number, share: number): number {
  return (1 - share) * normal + share * unusual
}

/**
 * Per crop: which seasons were unusual, how many had a greenness reading, and which showed a drop.
 * @param years - The field's past seasons.
 * @returns One summary per crop, in the order crops first appear.
 */
export function summariseCrops(years: FieldYear[]): CropSummary[] {
  const crops = [...new Set(years.map(y => y.crop).filter(c => c !== 'unknown'))]
  return crops.map(crop => {
    const unusual = years.filter(y => y.crop === crop && y.unusual === true)
    return { crop, unusualSeasons: unusual.map(y => y.year), withGreenness: unusual.filter(y => y.hit !== null).length, hits: unusual.filter(y => y.hit === true).map(y => y.year) }
  })
}

/**
 * Peak greenness compared with the same crop's other seasons on the field.
 * @param peaks - Peak greenness by year.
 * @param crops - Crop by year.
 * @param drop - Agreed drop, as a share (0.10 = 10% below usual).
 * @returns Usual greenness and hit per year; null where fewer than two other seasons of the crop have a reading.
 */
export function greennessHits(peaks: Record<number, number>, crops: Record<number, string>, drop: number): Record<number, { usual: number | null; hit: boolean | null }> {
  const out: Record<number, { usual: number | null; hit: boolean | null }> = {}
  for (const [key, crop] of Object.entries(crops)) {
    const year = Number(key), peak = peaks[year]
    if (crop === 'unknown') { out[year] = { usual: null, hit: null }; continue }
    const others = Object.entries(crops).filter(([y, c]) => c === crop && Number(y) !== year && peaks[Number(y)] !== undefined).map(([y]) => peaks[Number(y)]!)
    const usual = others.length >= 2 ? others.reduce((a, b) => a + b, 0) / others.length : null
    out[year] = { usual, hit: peak === undefined || usual === null || crop === 'unknown' ? null : peak <= (1 - drop) * usual }
  }
  return out
}
