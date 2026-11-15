/** Types for `crops.js`: the hand-entered crop table plugin code reads. */

/** Growing season, hot-day threshold and other starting values per crop name. */
export const CROP_TABLE: Record<string, { season: [number, number]; hotDayF: number; waterNeedInches: number; fertilizerPoundsPerAcre: number; cover: number }>
