/** Explicitly loaded fictional example; never substitutes for a farmer's own baseline. */
import { createHash, randomUUID } from 'node:crypto'
import type { FarmRecords } from './records.ts'
import { cornCalculation } from './domain.ts'
export async function loadCornDemo(records: FarmRecords) {
  const fieldId = randomUUID(), sourceId = randomUUID(), planId = randomUUID()
  const content = 'Fictional farmer baseline: 32000 seeds/acre on a 4 ha field. Try a farmer-selected 35000 plants/acre target on 1 ha using an assumed combined establishment fraction of 0.90. Actual seed packaging and quote must replace the sample 80000 seeds/bag at CAD 300. Keep 3 ha at the baseline. No yield improvement is asserted.'
  const inputs = { areaHa: 4, trialAreaHa: 1, baselineSeedsPerAcre: 32000, targetPlantsPerAcre: 35000, establishmentFraction: .9, seedsPerBag: 80000, pricePerBag: 300, currency: 'CAD' as const }
  await records.change(s => {
    s.fields.push({ id: fieldId, name: 'Corn learning strip · fictional demo', areaHa: 4, evidence: 'demo', years: {}, notes: ['Keep the lower wet area out of the trial; this is an invented constraint.'] })
    s.sources.push({ id: sourceId, title: 'Fictional grower planning notes', kind: 'knowledge', origin: 'Fieldwork example, authored for demonstration', capturedAt: new Date().toISOString(), sha256: createHash('sha256').update(content).digest('hex'), evidence: 'demo', scope: 'Invented values; no local agronomic recommendation.', sections: [{ locator: 'block 1', text: content }] })
    s.cornPlans.push({ id: planId, fieldId, season: new Date().getUTCFullYear() + 1, revision: 1, status: 'proposed', baselineReason: 'The farmer has used 32000 seeds/acre and wants to learn from a small comparison before changing the rest.', calculation: cornCalculation(inputs), constraints: ['Retain 3 ha at the baseline.', 'Avoid the lower wet area.', 'Purchase budget only; yield and profit remain unknown.'], inputs, assumptions: Object.keys(inputs).map(label => ({ label, evidence: 'demo' as const, citation: { sourceId, locator: 'block 1' } })), citations: [{ sourceId, locator: 'block 1' }], createdAt: new Date().toISOString(), observations: [] })
  })
  return { id: planId, calculation: cornCalculation(inputs) }
}
