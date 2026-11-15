/** NASA checks for rotation plans: how often unusual seasons occur here, and what they did to this field. Read-only; never changes a plan. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import schema from '@deepseek-ai/schemastery'
import { z, ZodError } from 'zod'
import { circleRing, earthdataToken, seasonGreenness, STAC_SEARCH, type Ring } from '../onboarding/hls.js'
import { CROP_TABLE } from '../onboarding/crops.js'
import { SETTINGS } from '../onboarding/settings.js'
import { createSources } from '../onboarding/sources.js'
import { seasonOdds, weatherRecord } from '../onboarding/weather-record.js'
import type {} from './records.ts'
import { greennessHits, summariseCrops, type FieldYear, type NasaCheck, type NasaStatus } from './rotation-signals-domain.ts'

/** Hand-drawn test outline on farmland near Brookings, South Dakota, about 5 km west of the long-term rotation study. Not a farmer's field. */
export const TEST_OUTLINE: Ring = [[-96.8400, 44.3300], [-96.8340, 44.3300], [-96.8340, 44.3345], [-96.8400, 44.3345], [-96.8400, 44.3300]]
const TEST_FIELD = { id: 'nasa-test-brookings', name: 'Brookings test outline' }

declare module '@deepseek-ai/cordis' { interface Context { nasaChecks: NasaChecks } }
/** Plugin identity. */
export const name = 'fieldwork-rotation-signals'
/** Farm records (field locations) and the Host web server (the page's route). */
export const inject = ['farmRecords', 'webServer']
/** Where checks are saved, where the Earthdata token is read from, the first weather year, and how many crop-map years are asked at once. */
export interface Config { file: string; earthdataTokenFile: string; firstWeatherYear: number; cropMapBatch: number }
/** Validated at composition time. */
export const Config: schema<Config> = schema.object({ file: schema.string().required(), earthdataTokenFile: schema.string().required(), firstWeatherYear: schema.number().min(1981).max(2100).default(1981), cropMapBatch: schema.number().min(1).max(13).default(3) })

const MAX_CHECKS = 20
const area = (ring: Ring) => { // shoelace on a local flat projection, hectares
  const lat = ring[0]![1] * Math.PI / 180, k = 111320 * Math.cos(lat)
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * k * ring[i + 1]![1] * 110540 - ring[i + 1]![0] * k * ring[i]![1] * 110540
  return Math.abs(a) / 2 / 10000
}
const center = (ring: Ring) => ({ longitude: ring.slice(0, -1).reduce((s, p) => s + p[0], 0) / (ring.length - 1), latitude: ring.slice(0, -1).reduce((s, p) => s + p[1], 0) / (ring.length - 1) })
const polygonSchema = z.object({ type: z.literal('Polygon'), coordinates: z.tuple([z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4).max(1000)]).rest(z.array(z.tuple([z.number(), z.number()]))) })
const pointSchema = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) })
const circleSchema = z.object({ shape: z.object({ type: z.literal('circle'), center: z.object({ latitude: z.number(), longitude: z.number() }), radiusFeet: z.number().positive() }) })

/** Runs and saves checks; one at a time per field. */
export class NasaChecks {
  private checks: NasaCheck[] = []
  private readonly running = new Map<string, Promise<NasaCheck>>()
  private readonly listeners = new Set<() => void>()
  constructor(private readonly config: Config, private readonly ctx: Context) {}
  /** Load saved checks; a missing file means none yet. */
  async open(): Promise<void> {
    // Checks saved before `outline` existed came from the test outline or onboarding's circle.
    try { this.checks = (JSON.parse(await readFile(this.config.file, 'utf8')).checks as NasaCheck[]).map(c => ({ ...c, outline: c.outline ?? (c.fieldId === TEST_FIELD.id || c.fieldName.endsWith(TEST_FIELD.name) ? 'test' : 'circle') })) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } // first run: no file
  }
  /** True when an Earthdata token is available. The token itself never leaves this process except to NASA. */
  connected(): boolean { return earthdataToken(this.config.earthdataTokenFile) !== null }
  /** Connection state and saved checks. */
  status(): NasaStatus { return { connected: this.connected(), checks: this.checks } }
  /** Notified after a check is saved. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  /**
   * Run a check for a farm field with an outline, or for the test outline.
   * @param request - `{ fieldId }` or `{ demo: true }`.
   * @returns The saved check.
   */
  async run(request: { fieldId?: string | undefined; demo?: boolean | undefined }, signal?: AbortSignal): Promise<NasaCheck> {
    const key = request.demo ? TEST_FIELD.id : request.fieldId ?? ''
    const busy = this.running.get(key); if (busy) return busy
    const job = this.compute(request, signal).finally(() => this.running.delete(key))
    this.running.set(key, job)
    return job
  }
  private field(request: { fieldId?: string | undefined; demo?: boolean | undefined }): { id: string; name: string; ring: Ring | null; point: { latitude: number; longitude: number } | null; demo: boolean; outline: NasaCheck['outline'] } {
    if (request.demo) return { ...TEST_FIELD, ring: TEST_OUTLINE, point: null, demo: true, outline: 'test' }
    const field = this.ctx.farmRecords.snapshot().fields.find(f => f.id === request.fieldId)
    if (!field) throw new NasaCheckError('Choose a field on My farm.')
    const demo = field.evidence === 'demo'
    // The field's own boundary when it has one; otherwise the circle onboarding stores; otherwise, for a fictional field only, the test outline.
    const polygon = polygonSchema.safeParse(field.geometry)
    if (polygon.success) return { id: field.id, name: field.name, ring: polygon.data.coordinates[0] as Ring, point: null, demo, outline: 'boundary' }
    const circle = circleSchema.safeParse(field.geometry)
    if (circle.success) return { id: field.id, name: field.name, ring: circleRing(circle.data.shape.center, circle.data.shape.radiusFeet * 0.3048) as Ring, point: null, demo, outline: 'circle' }
    // A point (a site, not a field) gets the weather checks only: field images need an outline.
    const point = pointSchema.safeParse(field.geometry)
    if (point.success) return { id: field.id, name: field.name, ring: null, point: { longitude: point.data.coordinates[0], latitude: point.data.coordinates[1] }, demo, outline: 'point' }
    if (demo) return { id: field.id, name: `${field.name} · ${TEST_FIELD.name}`, ring: TEST_OUTLINE, point: null, demo, outline: 'test' }
    throw new NasaCheckError('This field has no outline yet. Find it in Farm setup first.')
  }
  private async compute(request: { fieldId?: string | undefined; demo?: boolean | undefined }, signal?: AbortSignal): Promise<NasaCheck> {
    const field = this.field(request), { latitude, longitude } = field.ring ? center(field.ring) : field.point!, areaHa = field.ring ? area(field.ring) : 0
    const lastYear = new Date().getUTCFullYear() - 1, fieldFirst = SETTINGS.greenness.firstYear
    const sources = createSources(fetch, { tokenFile: this.config.earthdataTokenFile })
    const weather = await sources.weather({ latitude, longitude, firstYear: this.config.firstWeatherYear, lastYear }, signal)
    if (!weather) throw new NasaCheckError('NASA POWER weather could not be read. Try again later.')
    const fieldYears = Array.from({ length: lastYear - fieldFirst + 1 }, (_, i) => fieldFirst + i)
    // The crop map stalls under load; ask a few years at a time, like onboarding does.
    const mapped: (Awaited<ReturnType<typeof sources.cropMap>>)[] = []
    for (let i = 0; i < fieldYears.length; i += this.config.cropMapBatch) {
      mapped.push(...await Promise.all(fieldYears.slice(i, i + this.config.cropMapBatch).map(year => sources.cropMap({ latitude, longitude, acres: areaHa * 2.4710538, year, points: SETTINGS.crop.samplePoints }, signal).catch(() => null))))
    }
    const field_ = this.ctx.farmRecords.snapshot().fields.find(f => f.id === field.id)
    const crops: Record<number, string> = {}, cropSource: Record<number, FieldYear['cropSource']> = {}
    fieldYears.forEach((year, i) => {
      const told = field_?.years[String(year)]?.crop
      // Non-crop map classes (roads, buildings, grass, water) say nothing about the field's crop.
      const map = mapped[i]?.crop
      const fromMap = map !== undefined && (map in CROP_TABLE || map === 'fallow') ? map : undefined
      crops[year] = told ?? fromMap ?? 'unknown'
      cropSource[year] = told ? 'farmer' : fromMap ? 'crop map' : 'unknown'
    })
    const token = earthdataToken(this.config.earthdataTokenFile)
    let green: Awaited<ReturnType<typeof seasonGreenness>> | null = null, note: string | null = null
    if (!field.ring) note = 'A site location, not a field outline: weather checks only.'
    else if (token) {
      try { green = await seasonGreenness({ ring: field.ring, years: fieldYears, token, settings: SETTINGS.greenness, ...(signal ? { signal } : {}) }) }
      catch (error) { if (signal?.aborted) throw error; note = error instanceof Error ? error.message : 'Field images could not be read.' }
    } else note = 'Connect NASA Earthdata to add field greenness.'
    // Crop ids from the Rotation page map onto the crop table's growing seasons.
    const seasonOf = (crop: string) => crop === 'winter-wheat' ? 'wheat' : crop
    const known = Object.values(crops).map(seasonOf).filter(c => c in CROP_TABLE)
    const oddsCrop = known.length ? [...new Set(known)].sort((a, b) => known.filter(c => c === b).length - known.filter(c => c === a).length)[0]! : 'corn'
    const recordFor = new Map<string, ReturnType<typeof weatherRecord>>()
    const flagsFor = (crop: string) => { const key = seasonOf(crop); if (!recordFor.has(key)) recordFor.set(key, weatherRecord(weather, key, this.config.firstWeatherYear, lastYear)); return recordFor.get(key)! }
    const hits = greennessHits(green?.peaks ?? {}, crops, SETTINGS.droughtHeat.greennessDrop)
    const years: FieldYear[] = fieldYears.map(year => {
      const f = flagsFor(crops[year] === 'unknown' ? oddsCrop : crops[year]!).find(r => r.year === year)!
      const share = (a: number | null, b: number | null) => a === null || b === null || b === 0 ? null : a / b
      return { year, crop: crops[year]!, cropSource: cropSource[year]!, dry: f.dry, hot: f.hot, wetSpring: f.wetSpring, unusual: f.unusual, rainShare: share(f.rain, f.usualRain), springRainShare: share(f.springRain, f.usualSpringRain), greenness: green?.peaks[year] ?? null, usualGreenness: hits[year]?.usual ?? null, hit: hits[year]?.hit ?? null }
    })
    const seasons = Object.values(green?.seasons ?? {})
    const check: NasaCheck = {
      fieldId: field.id, fieldName: field.name, demo: field.demo, outline: field.outline, checkedAt: new Date().toISOString(),
      location: { latitude: Math.round(latitude * 1e4) / 1e4, longitude: Math.round(longitude * 1e4) / 1e4, areaHa: Math.round(areaHa * 10) / 10 },
      lastYear, oddsCrop, odds: seasonOdds(flagsFor(oddsCrop), lastYear), years, crops: summariseCrops(years),
      greenness: { connected: token !== null, seasons: seasons.filter(s => s.peak !== null).length, scenesFound: seasons.reduce((a, s) => a + s.found, 0), scenesUsed: seasons.reduce((a, s) => a + s.usable, 0), failures: green?.failures.length ?? 0, note },
      sources: [
        { name: 'NASA POWER daily weather', address: 'https://power.larc.nasa.gov/api/temporal/daily/point', detail: `Rain and daily high, ${this.config.firstWeatherYear}–${lastYear}, for an area about 50 km across` },
        { name: 'USDA Cropland Data Layer', address: 'https://nassgeodata.gmu.edu/CropScape/', detail: `Most common crop inside the field, ${fieldFirst}–${lastYear}` },
        { name: 'NASA HLS v2.0 (Landsat and Sentinel-2, 30 m)', address: STAC_SEARCH, detail: `Peak June–August greenness inside the field, ${fieldFirst}–${lastYear}; Earthdata login` },
      ],
      limits: [
        'Weather is for an area about 50 km across, not this field.',
        'Odds come from past seasons; they are not a forecast of next season.',
        'Field images start in 2013; 2013–2015 have few clear scenes.',
        'A greenness drop shows the crop looked weaker; it does not say why.',
        'Crop each year comes from the USDA crop map unless you entered it.',
      ],
    }
    this.checks = [check, ...this.checks.filter(c => c.fieldId !== check.fieldId)].slice(0, MAX_CHECKS)
    await mkdir(dirname(this.config.file), { recursive: true })
    await writeFile(this.config.file + '.tmp', JSON.stringify({ checks: this.checks }, null, 1)); await rename(this.config.file + '.tmp', this.config.file)
    for (const listener of this.listeners) listener()
    return check
  }
}

/** A check that cannot run, with a farmer-readable reason. */
export class NasaCheckError extends Error {}

/**
 * Provide the service and the page's route.
 * @param ctx - Plugin context.
 * @param config - Validated configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const checks = new NasaChecks(config, ctx)
  await checks.open()
  ctx.effect(() => { ctx.provide('nasaChecks', checks); return () => {} })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-nasa-checks', auth: 'required', async handler(req, res, peer) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.setHeader('X-Content-Type-Options', 'nosniff')
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    try {
      if (req.method === 'GET') { res.end(JSON.stringify(checks.status())); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return }
      let text = ''
      for await (const chunk of req) { text += chunk.toString(); if (Buffer.byteLength(text) > 2048) { res.writeHead(413).end(); return } }
      const input = z.union([z.object({ fieldId: z.string().min(1).max(200) }), z.object({ demo: z.literal(true) })]).parse(JSON.parse(text))
      const check = await checks.run(input)
      res.end(JSON.stringify({ ...checks.status(), check }))
    } catch (error) {
      const input = error instanceof ZodError || error instanceof SyntaxError || error instanceof NasaCheckError
      if (!input) ctx.logger.warn('NASA check failed', error)
      res.writeHead(input ? 400 : 500).end(JSON.stringify({ error: error instanceof NasaCheckError ? error.message : input ? 'Check the request.' : 'The NASA check could not finish. Nothing was changed; try again later.' }))
    }
  } }))
}
