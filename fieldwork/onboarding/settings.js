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

  wetSpring: {
    /** Spring months [first, last] of the harvest year: planting and establishment. */
    months: [4, 6],
    /** Wet: spring rain over this share of the 30-year average (heavy rain delays planting and stand establishment). */
    wetRainShare: 1.25,
  },

  /** NASA checks for rotation plans: how often unusual seasons occur, earlier against recent. */
  seasonOdds: {
    /** The earlier period, [first, last] year. */
    earlier: [1981, 2010],
    /** "More often" only if the recent share is at least this many times the earlier share... */
    moreOftenRatio: 1.5,
    /** ...and the recent count beats the earlier rate scaled to the recent years by at least this many seasons. */
    moreOftenExtraSeasons: 2,
  },

  /** NASA Harmonized Landsat and Sentinel-2 (HLS) field greenness. */
  greenness: {
    /** Months [first, last] searched for the season's peak. */
    months: [6, 8],
    /** A scene counts only if at least this share of the field's pixels are clear. */
    minClearShare: 0.8,
    /** The season's peak is the median of this many greenest clear scenes. */
    peakScenes: 3,
    /** Fewer clear 30 m pixels than this inside the field: field too small for this check (about 2.7 ha). */
    minClearPixels: 30,
    /** HLS starts in 2013 (Landsat 8); Sentinel-2 joins in late 2015. */
    firstYear: 2013,
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
