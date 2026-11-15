/**
 * The hand-entered crop table for the demo crops.
 *
 * These are rough starting values typed in by hand. They have not been
 * checked against an agronomy source. Check them before trusting a result.
 *
 * - season: [first month, last month] of growth. When the first month is
 *   later than the last (wheat), growth starts in the autumn of the year before.
 * - hotDayF: a day at or above this temperature counts as a hot day.
 * - waterNeedInches: typical water the crop uses in a season.
 * - fertilizerPoundsPerAcre: typical fertilizer nutrients applied.
 * - cover: the soil loss formula's cover factor (lower = ground better covered).
 */
export const CROP_TABLE = {
  corn: { season: [5, 9], hotDayF: 95, waterNeedInches: 24, fertilizerPoundsPerAcre: 230, cover: 0.25 },
  soybean: { season: [5, 9], hotDayF: 95, waterNeedInches: 20, fertilizerPoundsPerAcre: 60, cover: 0.30 },
  sorghum: { season: [6, 10], hotDayF: 100, waterNeedInches: 18, fertilizerPoundsPerAcre: 120, cover: 0.28 },
  wheat: { season: [10, 6], hotDayF: 90, waterNeedInches: 16, fertilizerPoundsPerAcre: 100, cover: 0.15 },
  alfalfa: { season: [4, 10], hotDayF: 95, waterNeedInches: 36, fertilizerPoundsPerAcre: 80, cover: 0.02 },
}

/** Names the USDA crop map uses, mapped to the crop table's names. */
export const CROP_MAP_NAMES = {
  'Corn': 'corn',
  'Soybeans': 'soybean',
  'Sorghum': 'sorghum',
  'Winter Wheat': 'wheat',
  'Spring Wheat': 'wheat',
  'Durum Wheat': 'wheat',
  'Alfalfa': 'alfalfa',
  'Fallow/Idle Cropland': 'fallow',
}
