/** Types for `hls.js`: field greenness from NASA HLS images. */

/** A closed longitude/latitude ring. */
export type Ring = [number, number][]

/** Greenness settings, as in `SETTINGS.greenness`. */
export interface GreennessSettings { months: [number, number]; minClearShare: number; peakScenes: number; minClearPixels: number; firstYear: number }

/** One scene's reading inside the field. */
export interface SceneReading { id: string; date: string; pixels: number; clearPixels: number; clearShare: number; ndvi: number | null }

/** One season's result. */
export interface SeasonReading { peak: number | null; found: number; usable: number; scenes: SceneReading[] }

/** Failure kinds: `login`, `catalog`, `image`, `small`. */
export class GreennessError extends Error { code: 'login' | 'catalog' | 'image' | 'small' }

/**
 * A circle as a 32-point ring.
 * @param center - Latitude and longitude.
 * @param radiusMetres - Radius in metres.
 * @returns The closed ring.
 */
export function circleRing(center: { latitude: number; longitude: number }, radiusMetres: number): Ring

/**
 * Peak greenness per season.
 * @param options - Field ring, years, Earthdata token, settings and abort signal.
 * @returns Peaks by year, per-season detail, and scenes that could not be read.
 */
export function seasonGreenness(options: { ring: Ring; years: number[]; token: string | null; settings: GreennessSettings; signal?: AbortSignal; fetchImpl?: typeof fetch; concurrency?: number }): Promise<{ peaks: Record<number, number>; seasons: Record<number, SeasonReading>; failures: { id: string; why: string }[] }>

/**
 * The Earthdata token from `EARTHDATA_TOKEN` or a file.
 * @param file - Optional token file path.
 * @returns The token, or null when not connected.
 */
export function earthdataToken(file?: string): string | null

/** NASA CMR-STAC search address for HLS. */
export const STAC_SEARCH: string
