/** Types for the parts of `sources.js` that plugin code calls. */
import type { DailyWeather } from './weather-record.js'

/** The crop map's most common crop inside the field for one year. */
export interface CropMapReading { crop: string; share: number; secondCrop: string | null }

/** Data sources; each returns null when its source gives nothing. */
export interface Sources {
  cropMap(request: { latitude: number; longitude: number; acres: number; year: number; points: number }, signal?: AbortSignal): Promise<CropMapReading | null>
  weather(request: { latitude: number; longitude: number; firstYear: number; lastYear: number }, signal?: AbortSignal): Promise<DailyWeather | null>
}

/**
 * Real data sources.
 * @param fetchImpl - fetch, replaceable in tests.
 * @param options - `tokenFile`: file holding a NASA Earthdata token.
 * @returns The sources.
 */
export function createSources(fetchImpl?: typeof fetch, options?: { tokenFile?: string }): Sources
