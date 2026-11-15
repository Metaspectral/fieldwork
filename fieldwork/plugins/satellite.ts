/** Bounded Sentinel-2 Collection 1 discovery and polygon-clipped NDVI from public COGs. */
import { z } from 'zod'
import { fromUrl, type GeoTIFFImage } from 'geotiff'
import proj4 from 'proj4'
import type { Boundary, Monitor, SceneObservation } from './learning-types.ts'
import { LearningError } from './learning-error.ts'
export interface SatelliteScene { key: string; id: string; acquiredAt: string; source: string; item: unknown }
export interface SatelliteProduct { observation: Omit<SceneObservation, 'artifactIds'>; files: { filename: string; mediaType: string; content: string }[] }
export interface SatelliteProvider {
  search(monitor: Monitor, from: string, to: string, signal: AbortSignal): Promise<{ scenes: SatelliteScene[]; limited: boolean }>
  process(monitor: Monitor, scene: SatelliteScene, signal: AbortSignal): Promise<SatelliteProduct>
}
const band = z.object({ nodata: z.number(), scale: z.number().positive().optional(), offset: z.number().optional() })
const asset = z.object({ href: z.url(), 'raster:bands': z.array(band).min(1) })
const itemSchema = z.object({ id: z.string(), collection: z.literal('sentinel-2-c1-l2a'), properties: z.object({ datetime: z.iso.datetime(), updated: z.string().optional(), 'proj:epsg': z.number().int() }), assets: z.object({ red: asset, nir: asset, scl: asset }) })
/** Test polygon membership in the same coordinates as the supplied ring. */
export function insidePolygon(x: number, y: number, ring: readonly (readonly number[])[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]! - a[0]!) * (y - a[1]!) / (b[1]! - a[1]!) + a[0]!) inside = !inside
  }
  return inside
}
/** Longitude/latitude envelope used for catalog discovery, not a surveyed field area. */
export function boundaryBbox(boundary: Boundary): [number, number, number, number] {
  const ring = boundary.coordinates[0]
  return [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))]
}
/**
 * Accept only the public Sentinel-2 bucket the catalog is expected to name.
 * @param href - Asset address from a catalog record.
 * @returns The normalized address; any other host, path, port, credential or query is rejected.
 */
export function publicAsset(href: string): string {
  const url = new URL(href)
  if (url.protocol !== 'https:' || url.hostname !== 'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com' || !url.pathname.startsWith('/sentinel-2-c1-l2a/') || url.username || url.password || url.port || url.search) throw new LearningError('The catalog supplied an unsupported image location; no image was read.', 'MONITOR_DATA')
  return url.href
}
/**
 * Pixel window covering projected bounds in a north-up raster.
 * @param image - Opened raster image.
 * @param bounds - West, south, east, north in the raster's projection.
 * @returns Left, top, right, bottom pixel offsets.
 */
export function imageWindow(image: GeoTIFFImage, bounds: [number, number, number, number]): [number, number, number, number] {
  const [ox, oy] = image.getOrigin(), [rx, ry] = image.getResolution()
  if (!(rx! > 0 && ry! < 0)) throw new LearningError('Unsupported raster orientation.', 'MONITOR_DATA')
  return [Math.floor((bounds[0] - ox!) / rx!), Math.floor((bounds[3] - oy!) / ry!), Math.ceil((bounds[2] - ox!) / rx!), Math.ceil((bounds[1] - oy!) / ry!)]
}
/** NDVI requires valid reflectance and one of the accepted SCL surface classes. */
export function qualifiedNdvi(red: number, nir: number, scl: number): number | null {
  // Vegetation and nonvegetated land only; uncertain, water, cloud, shadow and snow are excluded.
  if (![4, 5].includes(scl) || red < 0 || nir < 0 || red + nir <= 0) return null
  const ndvi = (nir - red) / (nir + red)
  return Number.isFinite(ndvi) && ndvi >= -1 && ndvi <= 1 ? ndvi : null
}
/** Public provider; every request is bounded by the caller's abort signal. */
export class EarthSearchProvider implements SatelliteProvider {
  async search(monitor: Monitor, from: string, to: string, signal: AbortSignal) {
    try {
      const response = await fetch('https://earth-search.aws.element84.com/v1/search', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-c1-l2a'], bbox: boundaryBbox(monitor.boundary), datetime: `${from}/${to}`, limit: 50, sortby: [{ field: 'properties.datetime', direction: 'desc' }] }), signal })
      if (!response.ok) throw new LearningError(`The satellite catalog returned HTTP ${response.status}. Try another check later.`, 'MONITOR_PROVIDER')
      const reader = response.body?.getReader(); if (!reader) throw new LearningError('The satellite catalog returned no response body.', 'MONITOR_PROVIDER')
      const chunks: Uint8Array[] = []; let size = 0
      try { while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new LearningError('The satellite catalog response exceeded its limit.', 'MONITOR_PROVIDER') }; chunks.push(r.value) } } finally { reader.releaseLock() }
      const data = z.object({ features: z.array(itemSchema).max(50), links: z.array(z.object({ rel: z.string() })).optional() }).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      return { scenes: data.features.map(item => ({ id: item.id, key: `${item.id}:${item.properties.updated ?? item.properties.datetime}`, acquiredAt: item.properties.datetime, source: `https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/${encodeURIComponent(item.id)}`, item })), limited: data.links?.some(l => l.rel === 'next') ?? false }
    } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof LearningError) throw error; throw new LearningError('Could not check the satellite catalog. Your previous observations are unchanged; try again later.', 'MONITOR_PROVIDER', error) }
  }
  async process(monitor: Monitor, scene: SatelliteScene, signal: AbortSignal): Promise<SatelliteProduct> {
    try {
      const item = itemSchema.parse(scene.item), epsg = item.properties['proj:epsg']
      const north = epsg >= 32601 && epsg <= 32660, south = epsg >= 32701 && epsg <= 32760
      if (!north && !south) throw new LearningError('This image uses an unsupported projection; UTM is required.', 'MONITOR_DATA')
      const projection = `+proj=utm +zone=${epsg % 100} ${south ? '+south' : ''} +datum=WGS84 +units=m +no_defs`
      const ring = monitor.boundary.coordinates[0].map(p => proj4('EPSG:4326', projection, p))
      const bounds: [number, number, number, number] = [Math.min(...ring.map(p => p[0]!)), Math.min(...ring.map(p => p[1]!)), Math.max(...ring.map(p => p[0]!)), Math.max(...ring.map(p => p[1]!))]
      const load = async (key: 'red' | 'nir' | 'scl') => {
        const options = { allowFullFile: false, blockSize: 65536, cacheSize: 16 }
        const tiff = await fromUrl(publicAsset(item.assets[key].href), options, signal)
        const image = await tiff.getImage()
        if (image.getGeoKeys()?.ProjectedCSTypeGeoKey !== epsg) throw new LearningError('Raster projection does not match its catalog record.', 'MONITOR_DATA')
        const window = imageWindow(image, bounds), width = window[2] - window[0], height = window[3] - window[1]
        if (width <= 0 || height <= 0 || width * height > 262144) throw new LearningError('The field lies outside this tile or exceeds the supported cropped raster size.', 'MONITOR_DATA')
        const data = await image.readRasters({ window, samples: [0], interleave: true, fillValue: 0, signal })
        return { image, window, width, height, data }
      }
      const [red, nir, scl] = await Promise.all([load('red'), load('nir'), load('scl')])
      if (red.width !== nir.width || red.height !== nir.height || JSON.stringify(red.image.getOrigin()) !== JSON.stringify(nir.image.getOrigin()) || JSON.stringify(red.image.getResolution()) !== JSON.stringify(nir.image.getResolution())) throw new LearningError('Reflectance bands are not on the same grid.', 'MONITOR_DATA')
      const rb = item.assets.red['raster:bands'][0]!, nb = item.assets.nir['raster:bands'][0]!
      if (rb.scale === undefined || rb.offset === undefined || nb.scale === undefined || nb.offset === undefined) throw new LearningError('Collection 1 reflectance scaling is missing; NDVI was not calculated.', 'MONITOR_DATA')
      const [ox, oy] = red.image.getOrigin(), [rx, ry] = red.image.getResolution(), [sx, sy] = scl.image.getOrigin(), [srx, sry] = scl.image.getResolution()
      const stride = Math.max(1, Math.ceil(Math.max(red.width, red.height) / 128)), width = Math.ceil(red.width / stride), height = Math.ceil(red.height / stride)
      const values: (number | null)[] = Array(width * height).fill(null), csv = ['column,row,easting_m,northing_m,red_dn,nir_dn,scl,ndvi']
      let totalPixels = 0, validPixels = 0, sum = 0
      for (let y = 0; y < red.height; y++) for (let x = 0; x < red.width; x++) {
        const east = ox! + (red.window[0] + x + .5) * rx!, northing = oy! + (red.window[1] + y + .5) * ry!
        if (!insidePolygon(east, northing, ring)) continue
        totalPixels++
        const i = y * red.width + x, rv = Number(red.data[i]), nv = Number(nir.data[i])
        const scx = Math.floor((east - sx!) / srx!) - scl.window[0], scy = Math.floor((northing - sy!) / sry!) - scl.window[1]
        const cls = scx >= 0 && scy >= 0 && scx < scl.width && scy < scl.height ? Number(scl.data[scy * scl.width + scx]) : 0
        const ndvi = rv === rb.nodata || nv === nb.nodata ? null : qualifiedNdvi(rv * rb.scale + rb.offset, nv * nb.scale + nb.offset, cls)
        if (ndvi !== null) { sum += ndvi; validPixels++ }
        if (x % stride === 0 && y % stride === 0) values[Math.floor(y / stride) * width + Math.floor(x / stride)] = ndvi === null ? null : Math.round(ndvi * 10000) / 10000
        csv.push(`${x},${y},${east.toFixed(2)},${northing.toFixed(2)},${rv},${nv},${cls},${ndvi === null ? '' : ndvi.toFixed(6)}`)
      }
      const usableFraction = totalPixels ? validPixels / totalPixels : 0
      const observation: SatelliteProduct['observation'] = { id: scene.id, key: scene.key, acquiredAt: scene.acquiredAt, source: scene.source, usableFraction, validPixels, totalPixels, meanNdvi: validPixels ? sum / validPixels : null, qualified: usableFraction >= monitor.minUsableFraction && validPixels >= monitor.minValidPixels, grid: { width, height, values }, footprint: monitor.boundary }
      return { observation, files: [{ filename: 'source-item.json', mediaType: 'application/json', content: JSON.stringify(scene.item, null, 2) }, { filename: 'cropped-pixels.csv', mediaType: 'text/csv', content: csv.join('\n') + '\n' }, { filename: 'observation.json', mediaType: 'application/json', content: JSON.stringify({ ...observation, epsg, attribution: `Contains modified Copernicus Sentinel data (${scene.acquiredAt.slice(0, 4)}); COG processing and catalog by Element 84.`, redScaling: rb, nirScaling: nb, quality: 'SCL vegetation/nonvegetated only; nearest native classification; no causal interpretation', gridStride: stride, nativePixelMetres: [rx, ry] }, null, 2) }] }
    } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof LearningError) throw error; throw new LearningError('Could not process this scene; its pixels were not accepted. A later check can retry.', 'MONITOR_DATA', error) }
  }
}
/** Explicit fictional observations for the opt-in demonstration; never a live-provider fallback. */
export class DemoSatelliteProvider implements SatelliteProvider {
  async search(_monitor: Monitor, _from: string, to: string, _signal: AbortSignal) {
    const date = to.slice(0, 10)
    return { scenes: [{ id: `fictional-${date}`, key: `fictional-${date}`, acquiredAt: `${date}T00:00:00.000Z`, source: 'Fictional demonstration pixels; no satellite was contacted.', item: { demo: true } }], limited: false }
  }
  async process(monitor: Monitor, scene: SatelliteScene, _signal: AbortSignal): Promise<SatelliteProduct> {
    const width = 24, height = 18, values = Array.from({ length: width * height }, (_, i) => Math.round((.72 + .05 * Math.sin(i * .3) - (i % width < 8 && i / width > 9 ? .32 : 0)) * 10000) / 10000)
    const observation = { id: scene.id, key: scene.key, acquiredAt: scene.acquiredAt, source: scene.source, usableFraction: 1, validPixels: width * height, totalPixels: width * height, meanNdvi: values.reduce((s, n) => s + n, 0) / values.length, qualified: true, grid: { width, height, values }, footprint: monitor.boundary }
    return { observation, files: [{ filename: 'fictional-observation.json', mediaType: 'application/json', content: JSON.stringify(observation, null, 2) }] }
  }
}
