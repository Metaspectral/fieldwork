/** Client-safe schemas for attributable field context, evidence, and corn decisions. */
import { z } from 'zod'
const text = z.string().trim().min(1).max(2000)
export const evidenceKind = z.enum(['farmer-reported', 'measured', 'regional', 'assumed', 'missing', 'demo'])
export const citationSchema = z.object({ sourceId: text, locator: text })
export const fieldSchema = z.object({
  id: text, name: text, areaHa: z.number().positive().max(100000).optional(),
  evidence: evidenceKind, years: z.record(z.string(), z.object({ crop: text.optional(), notes: z.array(text) })),
  notes: z.array(text),
  // External provider geometry is retained as data, never treated as farm ownership evidence.
  geometry: z.record(z.string(), z.unknown()).optional(),
})
export const sourceSchema = z.object({
  id: text, title: text, kind: z.enum(['website', 'spreadsheet', 'pdf', 'knowledge']),
  origin: text, capturedAt: z.iso.datetime(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  evidence: evidenceKind, scope: text,
  sections: z.array(z.object({ locator: text, text: z.string().max(100000) })).max(10000),
  originalFile: text.optional(), filename: z.string().max(200).optional(),
})
export const cornInputsSchema = z.object({
  areaHa: z.number().positive().max(100000), trialAreaHa: z.number().positive().max(100000),
  baselineSeedsPerAcre: z.number().positive().max(200000), targetPlantsPerAcre: z.number().positive().max(200000),
  establishmentFraction: z.number().positive().max(1), seedsPerBag: z.number().int().positive().max(1000000),
  pricePerBag: z.number().nonnegative().max(1000000).multipleOf(.01), currency: z.enum(['CAD', 'USD']),
})
const budgetSchema = z.object({ seeds: z.number().int().nonnegative(), wholeBags: z.number().int().nonnegative(), purchaseCost: z.number().nonnegative(), leftoverSeeds: z.number().int().nonnegative() })
/** Saved calculation output remains attached to the method version that produced it. */
export const cornResultSchema = z.object({ method: z.literal('corn-seed-budget-v1'), acresPerHa: z.number().positive(), alternativeSeedsPerAcre: z.number().int().positive(), baseline: budgetSchema, trial: budgetSchema, additionalPurchaseCost: z.number(), currency: z.enum(['CAD', 'USD']), limits: text })
export const cornPlanSchema = z.object({
  id: text, fieldId: text, season: z.number().int().min(1900).max(2200), revision: z.number().int().positive(),
  supersedes: text.optional(), status: z.enum(['proposed', 'accepted']),
  baselineReason: text, constraints: z.array(text).min(1), inputs: cornInputsSchema, calculation: cornResultSchema,
  assumptions: z.array(z.object({ label: text, evidence: evidenceKind, citation: citationSchema.optional() })).min(1),
  citations: z.array(citationSchema), createdAt: z.iso.datetime(), acceptedAt: z.iso.datetime().optional(),
  observations: z.array(z.object({ id: text, date: z.iso.date(), text, evidence: evidenceKind, citation: citationSchema.optional() })),
})
export type CornInputs = z.infer<typeof cornInputsSchema>
/** Mechanical budget comparison; no yield response, suitability, or profit is inferred. */
export function cornCalculation(input: CornInputs): z.infer<typeof cornResultSchema> {
  const p = cornInputsSchema.parse(input)
  if (p.trialAreaHa > p.areaHa) throw new z.ZodError([{ code: 'custom', path: ['trialAreaHa'], message: 'Trial area exceeds the field area.' }])
  const acresPerHa = 10000 / 4046.8564224
  const alternativeSeedsPerAcre = Math.ceil(p.targetPlantsPerAcre / p.establishmentFraction)
  if (alternativeSeedsPerAcre > 200000) throw new z.ZodError([{ code: 'custom', path: ['establishmentFraction'], message: 'Implied seeding rate exceeds the supported calculator range; review the inputs.' }])
  const budget = (seeds: number) => {
    seeds = Math.ceil(seeds)
    const wholeBags = Math.ceil(seeds / p.seedsPerBag)
    const costCents = wholeBags * Math.round(p.pricePerBag * 100)
    if (!Number.isSafeInteger(costCents)) throw new z.ZodError([{ code: 'custom', path: ['pricePerBag'], message: 'Budget exceeds the supported exact currency range.' }])
    return { seeds, wholeBags, purchaseCost: costCents / 100, leftoverSeeds: wholeBags * p.seedsPerBag - seeds }
  }
  const baseline = budget(p.areaHa * acresPerHa * p.baselineSeedsPerAcre)
  const trial = budget((p.areaHa - p.trialAreaHa) * acresPerHa * p.baselineSeedsPerAcre + p.trialAreaHa * acresPerHa * alternativeSeedsPerAcre)
  return { method: 'corn-seed-budget-v1', acresPerHa, alternativeSeedsPerAcre, baseline, trial, additionalPurchaseCost: Math.round((trial.purchaseCost - baseline.purchaseCost) * 100) / 100, currency: p.currency, limits: 'Combined field establishment includes germination and field losses. Whole-bag purchase budget assumes one interchangeable seed lot and no existing inventory. No yield, profit, or recommended population is calculated.' }
}
