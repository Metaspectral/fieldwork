/** Explicitly loaded Brookings example: real USDA field outlines near the rotation study site. Never a farmer's own records. */
import { randomUUID } from 'node:crypto'
import type { FarmRecords, FarmState } from './records.ts'
import { brookingsSource, usdaClassNote, type RotationCropId } from './rotation-domain.ts'
const haPerAcre = 4046.8564224 / 10000
// USDA Cropland Data Layer classes that occur on the chosen outlines; only crops the rotation list names become a crop.
const classes: Record<number, { crop?: RotationCropId; name: string }> = {
  1: { crop: 'corn', name: 'Corn' }, 5: { crop: 'soybean', name: 'Soybeans' }, 23: { crop: 'spring-wheat', name: 'Spring wheat' }, 24: { crop: 'winter-wheat', name: 'Winter wheat' },
  28: { crop: 'oats', name: 'Oats' }, 61: { name: 'Fallow or idle cropland' }, 121: { name: 'Developed, open space' }, 176: { name: 'Grass or pasture' },
}
/** Three neighbouring outlines within about one kilometre of the study location. Rings are longitude/latitude, simplified to about five metres; `inside` is a circle within the outline for point checks. */
export const brookingsFields = [
  { csbId: '461825008263674', name: 'West strip', acres: 12.21, classes: [121, 1, 5, 23, 24, 1, 5, 5], inside: { longitude: -96.76932, latitude: 44.3207, radiusFeet: 160 },
    ring: [[-96.76954, 44.32251], [-96.76865, 44.32224], [-96.76865, 44.31874], [-96.77143, 44.31874], [-96.77143, 44.3191], [-96.76999, 44.31919], [-96.76999, 44.32233], [-96.7699, 44.32251], [-96.76954, 44.32251]] },
  { csbId: '461825008263673', name: 'West block', acres: 20.65, classes: [121, 1, 5, 23, 24, 1, 5, 176], inside: { longitude: -96.7712, latitude: 44.3206, radiusFeet: 290 },
    ring: [[-96.77017, 44.32251], [-96.76999, 44.32233], [-96.76999, 44.31919], [-96.77143, 44.3191], [-96.77143, 44.31874], [-96.77332, 44.31874], [-96.77332, 44.31972], [-96.77242, 44.31972], [-96.77242, 44.31999], [-96.77269, 44.31999], [-96.77269, 44.32125], [-96.77242, 44.32161], [-96.77242, 44.32188], [-96.77116, 44.32251], [-96.77017, 44.32251]] },
  { csbId: '461825001925260', name: 'East field', acres: 17.97, classes: [61, 61, 1, 5, 1, 5, 1, 1], inside: { longitude: -96.7559, latitude: 44.31823, radiusFeet: 160 },
    ring: [[-96.75457, 44.31837], [-96.75332, 44.31774], [-96.75287, 44.31711], [-96.75287, 44.31675], [-96.75323, 44.31639], [-96.75466, 44.31639], [-96.75466, 44.31558], [-96.75493, 44.31558], [-96.75493, 44.31576], [-96.75556, 44.31576], [-96.75556, 44.31675], [-96.75592, 44.31711], [-96.75727, 44.31774], [-96.75763, 44.31774], [-96.75754, 44.31873], [-96.75457, 44.31873], [-96.75457, 44.31837]] },
] as const
const firstYear = 2018
/**
 * Add the three USDA outlines with their 2018–2025 crop classes, all labelled as an example. Entries already on file are left alone.
 * @param records - Farm record owner.
 * @returns Ids of the entries added by this call.
 */
export async function loadBrookingsExample(records: FarmRecords): Promise<string[]> {
  const added: FarmState['fields'] = []
  const on = (key: string) => records.snapshot().fields.some(f => f.geometry?.example === key)
  for (const f of brookingsFields) {
    if (on(f.csbId)) continue
    added.push({
      id: randomUUID(), name: `${f.name} · Brookings example`, areaHa: f.acres * haPerAcre, evidence: 'demo',
      notes: [`Example only: a real field outline near Brookings, South Dakota, from ${brookingsSource.citation} Outline ${f.csbId}. Crops are read from satellite images by USDA, not reported by a farmer, and nobody has confirmed this as their field.`],
      years: Object.fromEntries(f.classes.map((code, i) => { const c = classes[code]!; return [String(firstYear + i), c.crop ? { crop: c.crop, notes: [] } : { notes: [`${usdaClassNote}${c.name}`] }] })),
      geometry: { type: 'Polygon', coordinates: [f.ring], example: f.csbId, source: brookingsSource.id, shape: { type: 'circle', center: { latitude: f.inside.latitude, longitude: f.inside.longitude }, radiusFeet: f.inside.radiusFeet } },
    })
  }
  if (added.length) await records.change(s => { s.fields.push(...added) })
  return added.map(f => f.id)
}
