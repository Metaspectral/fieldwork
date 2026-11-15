/** Brookings example loading, field locations, picture placement, PNG encoding and picture replacement. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { FarmError, FarmRecords } from './records.ts'
import { encodePng, fetchFarmPicture, readFarmPicture, readFarmPictureBytes, refreshFarmPicture } from './farm-picture.ts'
import { fieldLabelPoint, fieldLocation, pictureProjection, type FarmPicture } from './farm-picture-types.ts'
import { brookingsFields, loadBrookingsExample } from './rotation-brookings.ts'
import { rotationCrops, shortYearNote } from './rotation-domain.ts'

async function withRecords(run: (records: FarmRecords) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-picture-'))
  try { await run(FarmRecords.open(join(home, 'records.json'))) } finally { await rm(home, { recursive: true, force: true }) }
}
const picture: FarmPicture = { sceneId: 'local-test', acquiredAt: '2026-07-01T17:00:00Z', fetchedAt: '2026-11-15T00:00:00Z', source: 'https://example.test/scene', attribution: 'Test picture.', width: 2, height: 1, corners: [[-97, 45], [-96, 45], [-96, 44], [-97, 44]] }

test('the Brookings example adds three labelled outlines with USDA crops, once', async () => withRecords(async records => {
  assert.equal((await loadBrookingsExample(records)).length, 3)
  assert.equal((await loadBrookingsExample(records)).length, 0, 'a second load adds nothing')
  const fields = records.snapshot().fields
  assert.equal(fields.length, 3)
  for (const f of fields) { assert.equal(f.evidence, 'demo'); assert.match(f.name, /· Brookings example$/); assert.match(f.notes[0]!, /^Example only/) }
  const strip = fields[0]!
  assert.deepEqual(Object.keys(strip.years), ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'])
  assert.deepEqual(['2019', '2020', '2021', '2022'].map(y => strip.years[y]!.crop), ['corn', 'soybean', 'spring-wheat', 'winter-wheat'])
  assert.equal(strip.years['2018']!.crop, undefined, 'a class that is not a rotation crop stays a note')
  assert.deepEqual(strip.years['2018']!.notes, ['USDA class: Developed, open space'])
  assert.equal(shortYearNote(strip.years['2018']!.notes[0]!), 'Developed, open space')
  assert.equal(shortYearNote('Planted late'), 'Planted late')
  assert.ok(Math.abs(strip.areaHa! - 12.21 * .40468564224) < 1e-9)
  for (const f of fields) for (const y of Object.values(f.years)) if (y.crop) assert.ok(rotationCrops.some(c => c.id === y.crop), y.crop)
}))
test('each example outline is a closed ring and its check circle lies inside the ring', () => {
  for (const f of brookingsFields) {
    assert.deepEqual(f.ring[0], f.ring.at(-1))
    // Ray casting: a point is inside when a ray to the east crosses the ring an odd number of times.
    let inside = false
    for (let i = 0, j = f.ring.length - 1; i < f.ring.length; j = i++) { const [xi, yi] = f.ring[i]!, [xj, yj] = f.ring[j]!; if (yi > f.inside.latitude !== yj > f.inside.latitude && f.inside.longitude < (xj - xi) * (f.inside.latitude - yi) / (yj - yi) + xi) inside = !inside }
    assert.ok(inside, f.name)
  }
})
test('a field location is read from an outline or a point and nothing else', () => {
  assert.deepEqual(fieldLocation({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]], shape: { type: 'circle' } })?.kind, 'outline')
  assert.deepEqual(fieldLocation({ type: 'Point', coordinates: [1, 2] }), { kind: 'point', points: [[1, 2]] })
  assert.equal(fieldLocation(undefined), undefined)
  assert.equal(fieldLocation({ shape: { type: 'circle', center: { latitude: 1, longitude: 2 }, radiusFeet: 100 } }), undefined)
  assert.equal(fieldLocation({ type: 'Point', coordinates: [200, 2] }), undefined, 'a longitude off the globe is not a location')
})
test('a label goes on the stored inside circle, else the area centre of the outline, else the point', () => {
  const near = (actual: [number, number] | undefined, expected: [number, number]) => assert.ok(actual && Math.abs(actual[0] - expected[0]) < 1e-9 && Math.abs(actual[1] - expected[1]) < 1e-9, `${actual} is not ${expected}`)
  // An L-shaped outline: the average of its corners is pulled toward the corner-heavy side; the area centre is not.
  const ring = [[-96, 44], [-95.6, 44], [-95.6, 44.1], [-95.9, 44.1], [-95.9, 44.4], [-96, 44.4], [-96, 44]]
  near(fieldLabelPoint({ type: 'Polygon', coordinates: [ring] }), [-96 + .0095 / .07, 44 + .0095 / .07])
  near(fieldLabelPoint({ type: 'Polygon', coordinates: [ring], shape: { type: 'circle', center: { longitude: -95.95, latitude: 44.2 }, radiusFeet: 100 } }), [-95.95, 44.2])
  near(fieldLabelPoint({ type: 'Point', coordinates: [1, 2] }), [1, 2])
  near(fieldLabelPoint({ type: 'Polygon', coordinates: [[[1, 1], [2, 2], [3, 3], [1, 1]]] }), [1, 1])
  assert.equal(fieldLabelPoint(undefined), undefined)
})
test('a picture position runs 0 to 1 from its top-left corner', () => {
  const at = pictureProjection(picture.corners)
  const near = (actual: [number, number], expected: [number, number]) => assert.ok(Math.abs(actual[0] - expected[0]) < 1e-9 && Math.abs(actual[1] - expected[1]) < 1e-9, `${actual} is not ${expected}`)
  near(at(-97, 45), [0, 0]); near(at(-96, 44), [1, 1]); near(at(-96.5, 44.75), [.5, .25])
  assert.ok(at(-95, 44.5)[0] > 1, 'east of the picture is outside it')
})
test('a PNG holds the given pixels and a wrong pixel count is refused', () => {
  const png = encodePng(Uint8Array.from([255, 0, 0, 0, 0, 255]), 2, 1)
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(png.readUInt32BE(16), 2); assert.equal(png.readUInt32BE(20), 1)
  const data = png.subarray(png.indexOf('IDAT') + 4, png.indexOf('IEND') - 8)
  assert.deepEqual([...inflateSync(data)], [0, 255, 0, 0, 0, 0, 255])
  assert.throws(() => encodePng(new Uint8Array(5), 2, 1), FarmError)
})
test('a fetched picture is saved beside the records, and a failed fetch keeps the saved one', async () => withRecords(async records => {
  assert.equal(await readFarmPicture(records.directory), null)
  await assert.rejects(fetchFarmPicture([], AbortSignal.timeout(1000)), /No field has a location/, 'no located field means no network read')
  const png = encodePng(Uint8Array.from([1, 2, 3, 4, 5, 6]), 2, 1)
  assert.deepEqual(await refreshFarmPicture(records, AbortSignal.timeout(1000), async () => ({ picture, png })), picture)
  assert.deepEqual(await readFarmPicture(records.directory), picture)
  assert.deepEqual(await readFarmPictureBytes(records.directory), png)
  await assert.rejects(refreshFarmPicture(records, AbortSignal.timeout(1000), async () => { throw new FarmError('No clear picture.', 'FARM_INPUT') }), /No clear picture/)
  assert.deepEqual(await readFarmPicture(records.directory), picture)
  assert.equal(JSON.parse(await readFile(join(records.directory, 'farm-picture.json'), 'utf8')).sceneId, 'local-test')
}))
test('live: a clear Sentinel-2 picture covers the Brookings example', { skip: process.env.FIELDWORK_SATELLITE_TEST !== '1', timeout: 180000 }, async () => withRecords(async records => {
  await loadBrookingsExample(records)
  const saved = await refreshFarmPicture(records, AbortSignal.timeout(120000))
  const at = pictureProjection(saved.corners)
  for (const f of records.snapshot().fields) for (const p of fieldLocation(f.geometry)!.points) for (const v of at(p[0], p[1])) assert.ok(v > 0 && v < 1)
  assert.equal((await readFarmPictureBytes(records.directory)).readUInt32BE(16), saved.width)
}))
