/** Shared mutations used by native tools and owner-submitted page commands. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { cornCalculation, cornPlanSchema, fieldSchema, citationSchema } from './domain.ts'
import { FarmError, type FarmRecords, type FarmState } from './records.ts'
export const fieldInputSchema = fieldSchema.pick({ name: true, areaHa: true, evidence: true, notes: true }).extend({ id: z.string().optional() })
export const proposalSchema = cornPlanSchema.omit({ id: true, revision: true, status: true, createdAt: true, acceptedAt: true, observations: true, calculation: true }).extend({ citations: z.array(citationSchema).min(1) })
/** Citations must point to an immutable catalog snapshot and an existing locator. */
export function checkCitations(state: FarmState, citations: z.infer<typeof citationSchema>[]): void {
  for (const c of citations) {
    const source = state.sources.find(s => s.id === c.sourceId)
    if (!source?.sections.some(s => s.locator === c.locator)) throw new FarmError(`Citation not found: ${c.sourceId} / ${c.locator}`, 'FARM_INPUT')
  }
}
export async function saveField(records: FarmRecords, input: unknown) {
  const value = fieldInputSchema.parse(input)
  const id = value.id ?? randomUUID()
  await records.change(s => {
    const existing = s.fields.find(f => f.id === id)
    if (value.id && !existing) throw new FarmError('Field not found.', 'FARM_INPUT')
    if (existing) {
      if (value.areaHa !== undefined && s.cornPlans.some(p => p.fieldId === id && p.status === 'accepted' && p.inputs.areaHa > value.areaHa!)) throw new FarmError('Field area is smaller than an accepted plan; retain the historical field and create a new field record.', 'FARM_INPUT')
      Object.assign(existing, value)
    } else s.fields.push({ ...value, id, years: {} })
  })
  return id
}
export async function proposeCorn(records: FarmRecords, input: unknown) {
  const value = proposalSchema.parse(input)
  const calculation = cornCalculation(value.inputs)
  const id = randomUUID()
  await records.change(s => {
    const field = s.fields.find(f => f.id === value.fieldId)
    if (!field?.areaHa || value.inputs.areaHa !== field.areaHa) throw new FarmError('Select a field with the matching confirmed area.', 'FARM_INPUT')
    checkCitations(s, [...value.citations, ...value.assumptions.flatMap(a => a.citation ? [a.citation] : [])])
    for (const key of Object.keys(value.inputs)) if (!value.assumptions.some(a => a.label === key)) throw new FarmError(`Label the evidence for input ${key}.`, 'FARM_INPUT')
    const previous = value.supersedes ? s.cornPlans.find(p => p.id === value.supersedes) : undefined
    if (value.supersedes && (!previous || previous.fieldId !== value.fieldId || previous.season !== value.season)) throw new FarmError('A revision must refer to the same field and season.', 'FARM_INPUT')
    s.cornPlans.push({ ...value, calculation, id, revision: (previous?.revision ?? 0) + 1, status: 'proposed', createdAt: new Date().toISOString(), observations: [] })
  })
  return { id, calculation }
}
export async function acceptCorn(records: FarmRecords, id: string) {
  return records.change(s => {
    const plan = s.cornPlans.find(p => p.id === id)
    if (!plan || plan.status !== 'proposed') throw new FarmError('Select a proposed plan to review.', 'FARM_INPUT')
    const field = s.fields.find(f => f.id === plan.fieldId)
    if (field?.areaHa !== plan.inputs.areaHa) throw new FarmError('Field area changed; create a revised proposal before accepting.', 'FARM_INPUT')
    if (plan.assumptions.some(a => a.evidence === 'missing')) throw new FarmError('Resolve missing planning inputs before accepting.', 'FARM_INPUT')
    if (field.evidence !== 'demo' && plan.assumptions.some(a => a.evidence === 'demo')) throw new FarmError('Replace demo inputs before accepting a plan for your own field.', 'FARM_INPUT')
    if (field.evidence !== 'demo' && plan.citations.some(c => s.sources.find(source => source.id === c.sourceId)?.evidence === 'demo')) throw new FarmError('Replace demo evidence before accepting a plan for your own field.', 'FARM_INPUT')
    const citations = [...plan.citations, ...plan.assumptions.flatMap(a => a.citation ? [a.citation] : [])]
    checkCitations(s, citations)
    if (field.evidence !== 'demo' && citations.some(c => ['demo', 'missing'].includes(s.sources.find(source => source.id === c.sourceId)!.evidence))) throw new FarmError('Replace demo or missing source evidence before accepting a real-field plan.', 'FARM_INPUT')
    if (plan.assumptions.some(a => ['measured', 'regional'].includes(a.evidence) && !a.citation)) throw new FarmError('Measured and regional inputs need a source citation; use assumed or farmer-reported for uncited inputs.', 'FARM_INPUT')
    plan.status = 'accepted'; plan.acceptedAt = new Date().toISOString()
  })
}
export const observationSchema = z.object({ id: z.string(), date: z.iso.date(), text: z.string().trim().min(1).max(2000), evidence: z.enum(['farmer-reported', 'measured', 'demo']), citation: citationSchema.optional() })
export async function observeCorn(records: FarmRecords, input: unknown) {
  const value = observationSchema.parse(input)
  return records.change(s => {
    const plan = s.cornPlans.find(p => p.id === value.id)
    if (!plan || plan.status !== 'accepted') throw new FarmError('Accept a plan before recording its observations.', 'FARM_INPUT')
    if (value.citation) checkCitations(s, [value.citation])
    plan.observations.push({ ...value, id: randomUUID() })
  })
}
