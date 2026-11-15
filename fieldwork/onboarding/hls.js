/**
 * Field greenness from NASA's Harmonized Landsat and Sentinel-2 (HLS) images, version 2.0.
 *
 * Search: NASA's CMR-STAC catalog, no login. Pixels: LP DAAC, which needs a NASA Earthdata
 * token. The token is sent only to the LP DAAC address; the short-lived signed address it
 * redirects to is then read without it. Only the window around the field is read.
 * Nothing here stores the token or returns it.
 */
import { readFileSync } from 'node:fs'
import { fromUrl } from 'geotiff'
import proj4 from 'proj4'

export const STAC_SEARCH = 'https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search'
const PROTECTED_HOST = 'data.lpdaac.earthdatacloud.nasa.gov'
/** Red and near-infrared band names in each half of HLS. */
export const BANDS = { 'HLSL30_2.0': { red: 'B04', nir: 'B05' }, 'HLSS30_2.0': { red: 'B04', nir: 'B8A' } }
/** Fmask bits 1 to 4: cloud, cloud or shadow nearby, cloud shadow, snow or ice. */
const FMASK_REJECT = 0b00011110
const NODATA = -9999

/** Thrown with a farmer-readable message; `code` says which kind of failure. */
export class GreennessError extends Error {
  constructor(message, code) { super(message); this.code = code }
}

/**
 * The Earthdata token: `EARTHDATA_TOKEN` when set, otherwise the first line of `file`, otherwise null.
 * @param file - optional token file path
 */
export function earthdataToken(file) {
  const fromEnv = process.env.EARTHDATA_TOKEN?.trim()
  if (fromEnv) return fromEnv
  if (!file) return null
  try { return readFileSync(file, 'utf8').trim() || null } catch (error) { if (error.code === 'ENOENT') return null; throw error } // no file means not connected
}

/** True when the ray from (x, y) crosses the ring an odd number of times. */
function inside(x, y, ring) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

/** A circle as a closed 32-point longitude/latitude ring. */
export function circleRing({ latitude, longitude }, radiusMetres) {
  const ring = []
  for (let i = 0; i <= 32; i++) {
    const a = (i % 32) / 32 * 2 * Math.PI
    ring.push([longitude + radiusMetres * Math.cos(a) / (111320 * Math.cos(latitude * Math.PI / 180)), latitude + radiusMetres * Math.sin(a) / 110540])
  }
  return ring
}

/** Median of a list of numbers. */
const median = list => { const s = [...list].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Search one window of dates; returns STAC items, sorted by date. */
export async function searchScenes({ ring, from, to, signal, fetchImpl = fetch }) {
  const bbox = [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))]
  const response = await fetchImpl(STAC_SEARCH, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: Object.keys(BANDS), bbox, datetime: `${from}T00:00:00Z/${to}T23:59:59Z`, limit: 250 }) })
  if (!response.ok) throw new GreennessError(`NASA's image catalog answered ${response.status}.`, 'catalog')
  const body = await response.json()
  return (body.features ?? []).filter(f => BANDS[f.collection]).sort((a, b) => a.properties.datetime.localeCompare(b.properties.datetime))
}

/** Exchange the protected address for a short-lived signed one. The token goes to NASA only. */
async function signedAddress(href, token, signal, fetchImpl) {
  const url = new URL(href)
  if (url.protocol !== 'https:' || url.hostname !== PROTECTED_HOST) throw new GreennessError('The catalog gave an unexpected image address; no image was read.', 'image')
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-0' }, signal })
  await response.body?.cancel()
  if (response.status === 401 || response.status === 403 || new URL(response.url).hostname === 'urs.earthdata.nasa.gov') throw new GreennessError('NASA Earthdata did not accept the login. Check the token.', 'login')
  if (!response.ok) throw new GreennessError(`NASA's image store answered ${response.status}.`, 'image')
  return response.url
}

/**
 * Average greenness (NDVI) of the clear pixels inside the field for one scene.
 * @returns { id, date, pixels, clearPixels, clearShare, ndvi } with ndvi null when no pixel is clear.
 */
export async function sceneGreenness({ item, ring, token, signal, fetchImpl = fetch }) {
  const names = BANDS[item.collection]
  const load = async key => {
    const tiff = await fromUrl(await signedAddress(item.assets[key].href, token, signal, fetchImpl), { allowFullFile: false, blockSize: 65536, cacheSize: 16 }, signal)
    const image = await tiff.getImage()
    const epsg = image.getGeoKeys()?.ProjectedCSTypeGeoKey
    if (!(epsg >= 32601 && epsg <= 32660)) throw new GreennessError('This image is not in a northern UTM projection.', 'image')
    const projected = ring.map(p => proj4('EPSG:4326', `+proj=utm +zone=${epsg % 100} +datum=WGS84 +units=m +no_defs`, p))
    const [ox, oy] = image.getOrigin(), [rx, ry] = image.getResolution()
    const xs = projected.map(p => p[0]), ys = projected.map(p => p[1])
    const window = [Math.floor((Math.min(...xs) - ox) / rx), Math.floor((Math.max(...ys) - oy) / ry), Math.ceil((Math.max(...xs) - ox) / rx), Math.ceil((Math.min(...ys) - oy) / ry)]
    const width = window[2] - window[0], height = window[3] - window[1]
    if (width <= 0 || height <= 0 || width * height > 262144) throw new GreennessError('The field lies outside this image or is too large to read.', 'image')
    const data = await image.readRasters({ window, samples: [0], interleave: true, fillValue: NODATA, signal })
    return { data, window, width, height, ox, oy, rx, ry, projected }
  }
  const [red, nir, mask] = await Promise.all([load(names.red), load(names.nir), load('Fmask')])
  let pixels = 0, clear = 0, sum = 0
  for (let y = 0; y < red.height; y++) for (let x = 0; x < red.width; x++) {
    const east = red.ox + (red.window[0] + x + 0.5) * red.rx, north = red.oy + (red.window[1] + y + 0.5) * red.ry
    if (!inside(east, north, red.projected)) continue
    pixels++
    const i = y * red.width + x, r = red.data[i], n = nir.data[i], q = mask.data[i]
    if (r === NODATA || n === NODATA || (q & FMASK_REJECT) !== 0 || r + n <= 0) continue
    clear++; sum += (n - r) / (n + r)
  }
  return { id: item.id, date: item.properties.datetime.slice(0, 10), pixels, clearPixels: clear, clearShare: pixels ? clear / pixels : 0, ndvi: clear ? sum / clear : null }
}

/** Run tasks with at most `limit` at once, keeping order. */
async function pool(tasks, limit) {
  const out = Array(tasks.length); let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i]() } }))
  return out
}

/**
 * Peak greenness for each season: the median of the greenest clear scenes in the chosen months.
 * @param options - { ring, years, token, settings: SETTINGS.greenness, signal, fetchImpl, onScene }
 * @returns { peaks: { [year]: number }, seasons: { [year]: { peak, scenes } }, failures }
 */
export async function seasonGreenness({ ring, years, token, settings, signal, fetchImpl = fetch, concurrency = 6 }) {
  if (!token) throw new GreennessError('Connect NASA Earthdata to read field images.', 'login')
  const [first, last] = settings.months, pad = m => String(m).padStart(2, '0')
  const lastDay = new Date(Date.UTC(2001, last, 0)).getUTCDate()
  const peaks = {}, seasons = {}, failures = []
  for (const year of years.filter(y => y >= settings.firstYear)) {
    const items = await searchScenes({ ring, from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${lastDay}`, signal, fetchImpl })
    const scenes = await pool(items.map(item => async () => {
      try { return await sceneGreenness({ item, ring, token, signal, fetchImpl }) } catch (error) {
        if (signal?.aborted || error.code === 'login') throw error
        failures.push({ id: item.id, why: error.message }); return null
      }
    }), concurrency)
    const read = scenes.filter(Boolean)
    if (read.length && read[0].pixels < settings.minClearPixels) throw new GreennessError(`The field covers ${read[0].pixels} image pixels; at least ${settings.minClearPixels} are needed (about ${Math.round(settings.minClearPixels * 0.09 * 10) / 10} ha).`, 'small')
    const usable = read.filter(s => s.ndvi !== null && s.clearShare >= settings.minClearShare && s.clearPixels >= settings.minClearPixels)
    const top = usable.map(s => s.ndvi).sort((a, b) => b - a).slice(0, settings.peakScenes)
    const peak = top.length ? median(top) : null
    seasons[year] = { peak, found: items.length, usable: usable.length, scenes: read }
    if (peak !== null) peaks[year] = peak
  }
  return { peaks, seasons, failures }
}
