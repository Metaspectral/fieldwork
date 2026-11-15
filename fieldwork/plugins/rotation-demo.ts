/** Explicitly loaded fictional rotation example; never substitutes for a farmer's own records. */
import { randomUUID } from 'node:crypto'
import type { FarmRecords } from './records.ts'
import { rotationCalculation, rotationLibrary, type RotationCropId, type RotationInputs } from './rotation-domain.ts'
const haPerAcre = 4046.8564224 / 10000
/**
 * Add three invented fields with crop history and one proposed plan, all labelled demo.
 * @param records - Farm record owner.
 * @returns The proposed plan id.
 */
export async function loadRotationDemo(records: FarmRecords) {
  const season = new Date().getUTCFullYear() + 1, planId = randomUUID()
  const field = (name: string, acres: number, crops: RotationCropId[]) => ({ id: randomUUID(), name: `${name} · fictional demo`, areaHa: acres * haPerAcre, evidence: 'demo' as const, notes: ['Invented field for the rotation example.'], years: Object.fromEntries(crops.map((crop, i) => [String(season - crops.length + i), { crop, notes: [] }])) })
  const home = field('Home quarter', 160, ['corn', 'soybean', 'corn']), north = field('North forty', 40, ['soybean', 'corn', 'soybean']), creek = field('Creek eighty', 80, ['corn', 'corn', 'corn'])
  const side = (id: string, columns: RotationInputs['current']['columns']) => { const r = rotationLibrary.rotations.find(r => r.id === id)!; return { rotationId: r.id, crops: r.crops, source: r.source, columns } }
  const corn = { yield: 180, price: 4.2, costs: 500 }, soybean = { yield: 55, price: 10.8, costs: 305 }
  const inputs: RotationInputs = { areaHa: home.areaHa, landCost: 230, currency: 'USD', current: side('cs', [corn, soybean]), alternative: side('cowws', [corn, { yield: 90, price: 3.5, otherIncome: 20, costs: 145 }, { yield: 60, price: 6, otherIncome: 30, costs: 179 }, soybean]) }
  await records.change(s => {
    s.fields.push(home, north, creek)
    s.rotationPlans.push({ id: planId, fieldId: home.id, season, revision: 1, status: 'proposed', reason: 'Invented example: corn and soybean pay better on these made-up numbers, so the farmer keeps the current rotation.', choice: 'current', startIndex: 1, evidence: 'demo', inputs, calculation: rotationCalculation(inputs), createdAt: new Date().toISOString() })
  })
  return { id: planId }
}
