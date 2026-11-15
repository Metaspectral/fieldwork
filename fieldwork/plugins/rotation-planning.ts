/** Rotation mutations shared by native tools and owner-submitted page commands. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { rotationCalculation, rotationCrops, rotationPlanSchema, type RotationCropId } from './rotation-domain.ts'
import { FarmError, type FarmRecords } from './records.ts'
/** Farmer-supplied part of a rotation plan; revision, status, dates and the calculation are assigned here. */
export const rotationProposalSchema = rotationPlanSchema.omit({ id: true, revision: true, status: true, createdAt: true, acceptedAt: true, calculation: true })
const cropsInputSchema = z.object({ fieldId: z.string(), crops: z.record(z.string().regex(/^(19|2[01])\d\d$/), z.enum(rotationCrops.map(c => c.id) as [RotationCropId, ...RotationCropId[]]).nullable()) })
/**
 * Record the crops grown on a field in past seasons. Planned crops stay in rotation plans.
 * @param records - Farm record owner.
 * @param input - Field id and a map of season to crop id; null clears a season.
 * @returns The committed state.
 */
export async function saveFieldCrops(records: FarmRecords, input: unknown) {
  const value = cropsInputSchema.parse(input)
  return records.change(s => {
    const field = s.fields.find(f => f.id === value.fieldId)
    if (!field) throw new FarmError('Field not found.', 'FARM_INPUT')
    for (const [year, crop] of Object.entries(value.crops)) {
      const entry = field.years[year] ?? { notes: [] }
      if (crop) entry.crop = crop; else delete entry.crop
      if (entry.crop || entry.notes.length) field.years[year] = entry; else delete field.years[year]
    }
  })
}
/**
 * Save a proposed rotation plan. Blank numbers are allowed here and block acceptance later.
 * @param records - Farm record owner.
 * @param input - Proposal matching {@link rotationProposalSchema}.
 * @returns The new plan id and its calculation.
 */
export async function proposeRotation(records: FarmRecords, input: unknown) {
  const value = rotationProposalSchema.parse(input)
  if (value.choice === 'alternative' && !value.inputs.alternative) throw new FarmError('Pick a rotation to compare before choosing to switch.', 'FARM_INPUT')
  const chosen = value.choice === 'alternative' ? value.inputs.alternative! : value.inputs.current
  if (value.startIndex >= chosen.crops.length) throw new FarmError('The starting crop is not part of the chosen rotation.', 'FARM_INPUT')
  const calculation = rotationCalculation(value.inputs)
  const id = randomUUID()
  await records.change(s => {
    const field = s.fields.find(f => f.id === value.fieldId)
    if (!field?.areaHa || value.inputs.areaHa !== field.areaHa) throw new FarmError('Select a field with the matching confirmed area.', 'FARM_INPUT')
    const previous = value.supersedes ? s.rotationPlans.find(p => p.id === value.supersedes) : undefined
    if (value.supersedes && (!previous || previous.fieldId !== value.fieldId)) throw new FarmError('A revision must refer to the same field.', 'FARM_INPUT')
    s.rotationPlans.push({ ...value, calculation, id, revision: (previous?.revision ?? 0) + 1, status: 'proposed', createdAt: new Date().toISOString() })
  })
  return { id, calculation }
}
/**
 * Accept a proposed rotation plan; the field then follows its chosen rotation.
 * @param records - Farm record owner.
 * @param id - Proposed plan id.
 * @returns The committed state. Rejects a compared plan with blank numbers, a changed field area, and demo numbers on a real field.
 */
export async function acceptRotation(records: FarmRecords, id: string) {
  return records.change(s => {
    const plan = s.rotationPlans.find(p => p.id === id)
    if (!plan || plan.status !== 'proposed') throw new FarmError('Select a proposed plan to review.', 'FARM_INPUT')
    const field = s.fields.find(f => f.id === plan.fieldId)
    if (field?.areaHa !== plan.inputs.areaHa) throw new FarmError('Field area changed; create a revised proposal before accepting.', 'FARM_INPUT')
    if (plan.inputs.alternative && !plan.calculation.difference) throw new FarmError('Fill in the missing numbers in a new revision before accepting.', 'FARM_INPUT')
    if (field.evidence !== 'demo' && plan.evidence === 'demo') throw new FarmError('Replace demo numbers before accepting a plan for your own field.', 'FARM_INPUT')
    plan.status = 'accepted'; plan.acceptedAt = new Date().toISOString()
  })
}
