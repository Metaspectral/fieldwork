/** Client-safe rotation library, rotation plan records, and per-acre budget arithmetic. */
import { z } from 'zod'

const text = z.string().trim().min(1).max(2000)
const money = z.number().min(-1000000).max(1000000)
const amount = z.number().nonnegative().max(1000000)
/** Crops a rotation can name, with the English name used in tool output and the yield unit per acre. */
export const rotationCrops = [
  { id: 'corn', name: 'Corn', unit: 'bu' },
  { id: 'soybean', name: 'Soybean', unit: 'bu' },
  { id: 'spring-wheat', name: 'Spring wheat', unit: 'bu' },
  { id: 'winter-wheat', name: 'Winter wheat', unit: 'bu' },
  { id: 'oats', name: 'Oats', unit: 'bu' },
  { id: 'field-pea', name: 'Field pea', unit: 'bu' },
  { id: 'sunflower', name: 'Sunflower', unit: 'lb' },
  { id: 'barley', name: 'Barley', unit: 'bu' },
] as const
/** Identifier of one crop in {@link rotationCrops}. */
export type RotationCropId = typeof rotationCrops[number]['id']
const cropId = z.enum(rotationCrops.map(c => c.id) as [RotationCropId, ...RotationCropId[]])
const cropOrder = z.array(cropId).min(1).max(8)
/** Where a crop order comes from. Every rotation shown to the farmer carries one. */
export const rotationSourceSchema = z.object({ kind: z.enum(['published-study', 'community', 'experiment', 'farmer']), citation: text, doi: text.optional() })
/** One rotation on file for a region: a crop order with its source and limits, never prices or yields. */
export const libraryRotationSchema = z.object({ id: text, crops: cropOrder, kind: z.enum(['usual-in-study', 'tested-alternative']), source: rotationSourceSchema, limits: text })
/** Rotations on file for one named region. */
export const rotationLibrarySchema = z.object({ region: z.object({ id: text, name: text }), rotations: z.array(libraryRotationSchema).min(1) })
  .refine(l => new Set(l.rotations.map(r => r.id)).size === l.rotations.length, { message: 'Rotation ids must be unique.' })
/** Validated rotation library. */
export type RotationLibrary = z.infer<typeof rotationLibrarySchema>
/**
 * Validate a rotation library; an entry without a source or limits is rejected.
 * @param raw - Untrusted library data.
 * @returns The validated library.
 */
export function parseRotationLibrary(raw: unknown): RotationLibrary { return rotationLibrarySchema.parse(raw) }

const brookings = { kind: 'published-study', citation: 'Bansal, Wang and Osborne 2024. Agronomy Journal 116(6):3145–3157.', doi: '10.1002/agj2.21688' } as const
const brookingsLimits = 'One research site near Brookings, South Dakota. No-till plots with low inputs. Costs and returns in the study cover one four-year cycle, 2017 to 2020. It does not tell you the yield or profit on your field.'
/** Dataset the Brookings example outlines and crops are copied from. */
export const brookingsSource = { id: 'usda-csb-2018-2025', title: 'USDA Crop Sequence Boundaries 2018–2025', citation: 'USDA National Agricultural Statistics Service, Crop Sequence Boundaries 2018–2025 (rev. 23).', url: 'https://www.nass.usda.gov/research-and-science/crop-sequence-boundaries' } as const
/** Start of the year note the Brookings example stores when the USDA class for that year is not a rotation crop. */
export const usdaClassNote = 'USDA class: '
/**
 * A year note as shown beside crop names, where the dataset is named once for the whole view.
 * @param note - Year note as stored.
 * @returns The class name alone for a USDA class note; any other note unchanged.
 */
export function shortYearNote(note: string): string {
  return note.startsWith(usdaClassNote) ? note.slice(usdaClassNote.length) : note
}
/** The six rotations of the Brookings study. Crop orders only; none of the study's prices, yields or returns. */
export const rotationLibrary: RotationLibrary = parseRotationLibrary({
  region: { id: 'us-sd-east', name: 'Eastern South Dakota' },
  rotations: [
    { id: 'cs', crops: ['corn', 'soybean'], kind: 'usual-in-study' },
    { id: 'ccc', crops: ['corn'], kind: 'usual-in-study' },
    { id: 'csswsf', crops: ['corn', 'soybean', 'spring-wheat', 'sunflower'], kind: 'tested-alternative' },
    { id: 'csswp', crops: ['corn', 'soybean', 'spring-wheat', 'field-pea'], kind: 'tested-alternative' },
    { id: 'cpwws', crops: ['corn', 'field-pea', 'winter-wheat', 'soybean'], kind: 'tested-alternative' },
    { id: 'cowws', crops: ['corn', 'oats', 'winter-wheat', 'soybean'], kind: 'tested-alternative' },
  ].map(r => ({ ...r, source: brookings, limits: r.id === 'ccc' ? `${brookingsLimits} Continuous corn started in 2017 in the study.` : brookingsLimits })),
})
/**
 * English display name of a crop order.
 * @param crops - Crop ids in rotation order.
 * @returns Names joined with en dashes; one crop reads as continuous.
 */
export function rotationName(crops: readonly RotationCropId[]): string {
  const names = crops.map(id => rotationCrops.find(c => c.id === id)!.name)
  return names.length === 1 ? `Continuous ${names[0]!.toLowerCase()}` : names.map((n, i) => i ? n.toLowerCase() : n).join('–')
}

/** Farmer-entered numbers for one crop-year, per acre. A blank required number leaves the rotation uncalculated. */
export const rotationColumnSchema = z.object({ yield: amount.optional(), price: amount.optional(), otherIncome: amount.optional(), costs: amount.optional() })
/** One side of a comparison: a crop order, its source, and one column of numbers per crop-year. */
export const rotationSideSchema = z.object({ rotationId: text.optional(), crops: cropOrder, source: rotationSourceSchema, columns: z.array(rotationColumnSchema) })
  .refine(s => s.columns.length === s.crops.length, { message: 'Enter one column of numbers per crop-year.' })
/** Inputs to the rotation budget. Area is in hectares as stored on the field; money is per acre. */
export const rotationInputsSchema = z.object({ areaHa: z.number().positive().max(100000), landCost: amount.optional(), currency: z.enum(['CAD', 'USD']), current: rotationSideSchema, alternative: rotationSideSchema.optional() })
const sideResult = z.object({ columns: z.array(z.object({ income: money, totalCost: money, profit: money }).nullable()), perAcre: money.optional(), wholeField: z.number().optional() })
/** Saved calculation output remains attached to the method version that produced it. */
export const rotationResultSchema = z.object({ method: z.literal('rotation-budget-v1'), acres: z.number().positive(), current: sideResult, alternative: sideResult.optional(), difference: z.object({ perAcre: money, wholeField: z.number() }).optional(), currency: z.enum(['CAD', 'USD']), limits: text })
/** A rotation decision for one field: keep the current rotation or switch, with the farmer's reason. */
export const rotationPlanSchema = z.object({
  id: text, fieldId: text, season: z.number().int().min(1900).max(2200), revision: z.number().int().positive(),
  supersedes: text.optional(), status: z.enum(['proposed', 'accepted']), reason: text,
  choice: z.enum(['current', 'alternative']), startIndex: z.number().int().min(0).max(7),
  evidence: z.enum(['farmer-reported', 'assumed', 'demo']),
  inputs: rotationInputsSchema, calculation: rotationResultSchema,
  createdAt: z.iso.datetime(), acceptedAt: z.iso.datetime().optional(),
})
/** Rotation budget inputs. */
export type RotationInputs = z.infer<typeof rotationInputsSchema>
/** Rotation budget result. */
export type RotationResult = z.infer<typeof rotationResultSchema>
/** Saved rotation plan. */
export type RotationPlan = z.infer<typeof rotationPlanSchema>
const cents = (value: number) => Math.round(value * 100) / 100
/**
 * Add up the farmer's own numbers per acre and crop-year. No yield response, ranking or advice is inferred.
 * @param input - Field area, land cost and one or two rotations with farmer-entered columns.
 * @returns Per-column income, cost and profit; each rotation's average per acre per year; the difference; whole-field figures. A rotation with a blank yield, price, costs or land cost has no average.
 */
export function rotationCalculation(input: RotationInputs): RotationResult {
  const p = rotationInputsSchema.parse(input)
  const acres = p.areaHa * 10000 / 4046.8564224
  const side = (s: z.infer<typeof rotationSideSchema>) => {
    const columns = s.columns.map(c => {
      if (c.yield === undefined || c.price === undefined || c.costs === undefined || p.landCost === undefined) return null
      const income = cents(c.price * c.yield + (c.otherIncome ?? 0)), totalCost = cents(c.costs + p.landCost)
      return { income, totalCost, profit: cents(income - totalCost) }
    })
    if (columns.some(c => c === null)) return { columns }
    const perAcre = cents(columns.reduce((sum, c) => sum + c!.profit, 0) / columns.length)
    return { columns, perAcre, wholeField: cents(perAcre * acres) }
  }
  const current = side(p.current), alternative = p.alternative && side(p.alternative)
  const difference = current.perAcre !== undefined && alternative?.perAcre !== undefined ? { perAcre: cents(alternative.perAcre - current.perAcre), wholeField: cents(cents(alternative.perAcre - current.perAcre) * acres) } : undefined
  return { method: 'rotation-budget-v1', acres, current, ...(alternative ? { alternative } : {}), ...(difference ? { difference } : {}), currency: p.currency, limits: 'Adds up the numbers you entered, per acre and per crop-year, with the same prices and costs every year. It does not predict yield, soil change, weather or prices, and it does not rank or recommend a rotation.' }
}
/**
 * The plan a field follows now.
 * @param plans - All saved rotation plans.
 * @param fieldId - Field to look up.
 * @returns The most recently accepted plan for the field, if any.
 */
export function fieldRotation(plans: readonly RotationPlan[], fieldId: string): RotationPlan | undefined {
  return plans.filter(p => p.fieldId === fieldId && p.status === 'accepted').sort((a, b) => (b.acceptedAt ?? '').localeCompare(a.acceptedAt ?? ''))[0]
}
/**
 * Crop the chosen rotation of a plan puts on the field in a given year.
 * @param plan - An accepted or proposed plan.
 * @param year - Season to read; years before the plan's season have no planned crop.
 * @returns The crop id, or undefined before the plan starts.
 */
export function plannedCrop(plan: RotationPlan, year: number): RotationCropId | undefined {
  if (year < plan.season) return undefined
  const crops = (plan.choice === 'alternative' && plan.inputs.alternative ? plan.inputs.alternative : plan.inputs.current).crops
  return crops[(plan.startIndex + year - plan.season) % crops.length]
}
