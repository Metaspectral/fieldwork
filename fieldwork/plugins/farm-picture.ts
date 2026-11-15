/** True-colour satellite picture of the located fields, read from public Sentinel-2 data only when the farmer asks. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { fromUrl } from 'geotiff'
import proj4 from 'proj4'
import { z } from 'zod'
import { FarmError, type FarmRecords, type FarmState } from './records.ts'
import { farmPictureSchema, fieldLocation, type FarmPicture } from './farm-picture-types.ts'
import { imageWindow, publicAsset } from './satellite.ts'

const catalog = 'https://earth-search.aws.element84.com/v1'
const itemSchema = z.object({ id: z.string(), properties: z.object({ datetime: z.iso.datetime(), 'proj:epsg': z.number().int() }), assets: z.object({ visual: z.object({ href: z.url() }), scl: z.object({ href: z.url() }) }) })
/** Ground kept around the fields, the smallest picture side, and the largest cut read from one scene. */
const marginMetres = 150, minimumMetres = 600, maximumPixels = 262144
const remote = { allowFullFile: false, blockSize: 65536, cacheSize: 16 }
/**
 * Encode 8-bit red, green, blue rows as a PNG file.
 * @param rgb - Pixel bytes, three per pixel, row by row.
 * @param width - Pixels per row.
 * @param height - Number of rows.
 * @returns The PNG file bytes.
 */
export function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  if (rgb.length !== width * height * 3) throw new FarmError('The picture has the wrong number of pixels.', 'FARM_STORAGE')
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) rows.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1)
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
/**
 * Find a recent clear growing-season Sentinel-2 scene and cut the true-colour picture around every located field.
 * @param fields - Farm fields; those without an outline or point are ignored.
 * @param signal - Cancels the catalog and image reads.
 * @param now - Time of the request; scenes from the two years before it are considered.
 * @returns The picture description and its PNG bytes. Fails without changing anything when no field is located, the fields are too far apart, or no clear scene is found.
 */
export async function fetchFarmPicture(fields: FarmState['fields'], signal: AbortSignal, now = new Date()): Promise<{ picture: FarmPicture; png: Buffer }> {
  const points = fields.flatMap(f => fieldLocation(f.geometry)?.points ?? [])
  if (!points.length) throw new FarmError('No field has a location yet, so there is nothing to take a picture of.', 'FARM_INPUT')
  const bbox = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
  try {
    const from = new Date(now.getTime() - 730 * 86400000).toISOString()
    const response = await fetch(`${catalog}/search`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-c1-l2a'], bbox, datetime: `${from}/${now.toISOString()}`, query: { 'eo:cloud_cover': { lt: 10 } }, limit: 100, sortby: [{ field: 'properties.datetime', direction: 'desc' }] }), signal })
    if (!response.ok) throw new FarmError(`The satellite catalog returned HTTP ${response.status}. Try again later.`, 'FARM_STORAGE')
    const found = z.object({ features: z.array(itemSchema).max(100) }).parse(await response.json())
    // Crops are easiest to tell apart in the growing season: June to September in the north, December to March in the south.
    const growing = (month: number) => bbox[1]! >= 0 ? month >= 6 && month <= 9 : month === 12 || month <= 3
    const candidates = found.features.filter(i => growing(new Date(i.properties.datetime).getUTCMonth() + 1)).slice(0, 4)
    for (const item of candidates) {
      const epsg = item.properties['proj:epsg'], north = epsg >= 32601 && epsg <= 32660, south = epsg >= 32701 && epsg <= 32760
      if (!north && !south) continue
      const projection = `+proj=utm +zone=${epsg % 100} ${south ? '+south' : ''} +datum=WGS84 +units=m +no_defs`
      const projected = points.map(p => proj4('EPSG:4326', projection, p))
      const centre = [0, 1].map(k => (Math.min(...projected.map(p => p[k]!)) + Math.max(...projected.map(p => p[k]!))) / 2)
      const half = [0, 1].map(k => Math.max(minimumMetres, Math.max(...projected.map(p => p[k]!)) - Math.min(...projected.map(p => p[k]!)) + 2 * marginMetres) / 2)
      const tiff = await fromUrl(publicAsset(item.assets.visual.href), remote, signal)
      const image = await tiff.getImage()
      if (image.getGeoKeys()?.ProjectedCSTypeGeoKey !== epsg || image.getSamplesPerPixel() < 3) continue
      const bounds: [number, number, number, number] = [centre[0]! - half[0]!, centre[1]! - half[1]!, centre[0]! + half[0]!, centre[1]! + half[1]!]
      const window = imageWindow(image, bounds)
      const columns = window[2] - window[0], rows = window[3] - window[1]
      if (columns * rows > maximumPixels) throw new FarmError('The located fields are too far apart for one picture.', 'FARM_INPUT')
      if (window[0] < 0 || window[1] < 0 || window[2] > image.getWidth() || window[3] > image.getHeight()) continue
      // Ten-metre pixels are enlarged smoothly so outlines and labels have room.
      const scale = Math.max(1, Math.min(4, Math.round(960 / columns))), width = columns * scale, height = rows * scale
      const data = await image.readRasters({ window, width, height, samples: [0, 1, 2], interleave: true, resampleMethod: 'bilinear', signal })
      const rgb = Uint8Array.from(data as ArrayLike<number>)
      // A scene clear on average can still have missing data or cloud over this farm; the scene classification says where.
      const classes = await (await fromUrl(publicAsset(item.assets.scl.href), remote, signal)).getImage()
      const labels = Array.from(await classes.readRasters({ window: imageWindow(classes, bounds), samples: [0], interleave: true, fillValue: 0, signal }) as ArrayLike<number>)
      // 0 no data, 1 saturated, 3 cloud shadow, 8 to 10 cloud, 11 snow.
      if (!labels.length || labels.filter(v => [0, 1, 3, 8, 9, 10, 11].includes(v)).length > labels.length * .02) continue
      const [ox, oy] = image.getOrigin(), [rx, ry] = image.getResolution()
      const corner = (column: number, row: number) => { const [longitude, latitude] = proj4(projection, 'EPSG:4326', [ox! + column * rx!, oy! + row * ry!]); return [longitude!, latitude!] }
      const picture = farmPictureSchema.parse({
        sceneId: item.id, acquiredAt: item.properties.datetime, fetchedAt: now.toISOString(), source: `${catalog}/collections/sentinel-2-c1-l2a/items/${encodeURIComponent(item.id)}`,
        attribution: 'Contains modified Copernicus Sentinel data, read from the Earth Search public catalog.', width, height,
        corners: [corner(window[0], window[1]), corner(window[2], window[1]), corner(window[2], window[3]), corner(window[0], window[3])],
      })
      return { picture, png: encodePng(rgb, width, height) }
    }
    throw new FarmError('No clear growing-season satellite picture was found for these fields in the last two years. Try again later.', 'FARM_INPUT')
  } catch (error) { if (signal.aborted) throw signal.reason; if (error instanceof FarmError) throw error; throw new FarmError('Could not read the satellite picture. Your records are unchanged; try again later.', 'FARM_STORAGE', error) }
}
/**
 * Read the saved picture description.
 * @param directory - Folder that holds the farm records.
 * @returns The description, or null when no picture has been saved.
 */
export async function readFarmPicture(directory: string): Promise<FarmPicture | null> {
  let text: string
  try { text = await readFile(join(directory, 'farm-picture.json'), 'utf8') }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw new FarmError('Could not read the saved farm picture.', 'FARM_STORAGE', error) }
  return farmPictureSchema.parse(JSON.parse(text))
}
/**
 * Read the saved picture's PNG bytes.
 * @param directory - Folder that holds the farm records.
 * @returns The PNG file.
 */
export function readFarmPictureBytes(directory: string): Promise<Buffer> { return readFile(join(directory, 'farm-picture.png')) }
/**
 * Fetch a new picture for the located fields and replace the saved one. The saved picture is kept when the fetch fails.
 * @param records - Farm record owner; the picture is stored beside its file.
 * @param signal - Cancels the reads.
 * @param fetchPicture - Picture source; tests pass a local one.
 * @returns The saved description.
 */
export async function refreshFarmPicture(records: FarmRecords, signal: AbortSignal, fetchPicture = fetchFarmPicture): Promise<FarmPicture> {
  const { picture, png } = await fetchPicture(records.snapshot().fields, signal)
  try {
    await mkdir(records.directory, { recursive: true })
    // The image is written before the description that makes it visible.
    await writeFile(join(records.directory, 'farm-picture.png.tmp'), png, { mode: 0o600 }); await rename(join(records.directory, 'farm-picture.png.tmp'), join(records.directory, 'farm-picture.png'))
    await writeFile(join(records.directory, 'farm-picture.json.tmp'), JSON.stringify(picture, null, 2), { mode: 0o600 }); await rename(join(records.directory, 'farm-picture.json.tmp'), join(records.directory, 'farm-picture.json'))
  } catch (error) { throw new FarmError('Could not save the farm picture.', 'FARM_STORAGE', error) }
  return picture
}
