/**
 * Every threshold the field history uses, in one place.
 * All of these are starting values from the spec. Change them here only.
 */
export const SETTINGS = {
  /** How many full years of history to show. */
  years: 10,
  /** How many years of weather count as "usual". */
  climateYears: 30,
  /** The headline compares bad years in this many recent years with the same number before. */
  recentWindow: 5,
  /** Thirds and fifths need at least this many years with a reading. */
  minYearsToCompare: 5,

  crop: {
    /** Below this share of the field, report the top two crops. */
    minShare: 0.6,
    /** Points sampled inside the field edge on the crop map. */
    samplePoints: 5,
    /** Growing months [first, last] used when the crop is not in the crop table. */
    defaultSeason: [4, 9],
    /** Hot-day temperature (°F) used when the crop is not in the crop table. */
    defaultHotDayF: 95,
  },

  droughtHeat: {
    /** Dry: season rain under this share of the 30-year average. */
    dryRainShare: 0.75,
    /** Hot: hot days in this top share of the 30 years. */
    hotTopShare: 1 / 5,
    /** Crop hit: peak greenness this far below the field's usual for that crop. */
    greennessDrop: 0.10,
  },

  water: {
    /** High use: shortfall in this top share of the field's years. */
    topShare: 1 / 3,
  },

  topsoil: {
    /** Watch above this share of the soil's tolerable loss; bad above all of it. */
    watchShareOfTolerable: 0.5,
    /** Slope length assumed for the soil loss formula, in feet. */
    slopeLengthFeet: 150,
    /** Support practice factor (1 = no terraces or contouring). */
    supportPractice: 1,
  },

  salt: {
    /** deciSiemens per metre: fine under watchFrom, bad above badAbove. */
    watchFrom: 2,
    badAbove: 4,
    /** Salt only applies where the 30-year average yearly rain is under this many inches. */
    dryClimateInches: 20,
  },

  costs: {
    /** Bad in the top share of the field's years, watch in the next share. */
    topShare: 1 / 3,
    middleShare: 1 / 3,
  },

  ranking: {
    /** Points per year over the recent window. */
    bad: 2,
    watch: 1,
    /** High is this score or more; medium is this or more; low is under it. */
    high: 6,
    medium: 3,
  },
}
