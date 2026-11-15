/**
 * Risk of a change: what a proposed rotation could cost on one field in a normal year and a
 * dry year compared with the current rotation, how often dry years came on this field (from
 * the field history), and the blockers to solve first. Deterministic; the crop table is configuration.
 *
 * The default crop table is EXAMPLE data for the demo, and every figure computed from it is
 * marked `example: true`. Replace it with state extension budgets through the risk-check
 * plugin config before showing farmers real numbers.
 */
import { z } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-error'
import type { EvidenceResult, Figure, Source } from './evidence.ts'

/** Per-crop economics in US dollars per acre. */
export interface CropProfile {
  /** Return over operating costs in a normal year, USD/acre. */
  normal: number
  /** Return over operating costs in a dry year, USD/acre. */
  dry: number
  /** What must be in place before this crop is a safe bet. */
  blockers: string[]
}

/** Example crop table. Made-up numbers; labeled as examples wherever they appear. */
export const EXAMPLE_CROPS: Record<string, CropProfile> = {
  corn: { normal: 150, dry: -20, blockers: [] },
  soybean: { normal: 110, dry: 30, blockers: ['An elevator or buyer that takes soybeans within hauling distance.', 'A planter set up for soybeans, or a custom operator.'] },
  sorghum: { normal: 70, dry: 40, blockers: ['A buyer for grain sorghum nearby; not every elevator takes it.', 'A plan for weeds without the corn herbicide program.'] },
  wheat: { normal: 40, dry: 10, blockers: ['A drill, and time to plant in the fall after the previous crop comes off.'] },
  alfalfa: { normal: 160, dry: 60, blockers: ['Hay equipment or a buyer for standing hay.', 'Three or more years on the same field.'] },
}

/** Risk-check tunables. */
export interface RiskModel {
  /** Crop table keyed by lowercase crop name. */
  crops: Record<string, CropProfile>
  /** True when the crop table is made up; every figure is then marked as an example. */
  cropsAreExamples: boolean
  /** Dry-year gain per distinct crop beyond two, USD/acre. Direction from Bowles et al. 2020; size is an example. */
  diversityDryCredit: number
  /** Relative half-width of every figure's range. */
  relativeUncertainty: number
}

/** Sources cited by the risk check. */
export const RISK_SOURCES: Source[] = [
  { id: 'bowles2020', title: 'Bowles et al., Long-term evidence shows that crop-rotation diversification increases agricultural resilience to adverse growing conditions in North America, One Earth', year: 2020, url: 'https://doi.org/10.1016/j.oneear.2020.02.007' },
  { id: 'history', title: 'This field\'s history in Fieldwork: years marked bad for drought and heat (field_risks)' },
  { id: 'budgets', title: 'State extension crop budgets, e.g. Kansas State University AgManager (not loaded yet)', url: 'https://www.agmanager.info/farm-mgmt-guides' },
  { id: 'example', title: 'Example numbers made up for this demo. Not data.' },
]

/** Risk check input. */
export const riskInput = z.object({
  field: z.string().trim().min(1).max(200),
  acres: z.number().positive().max(1000000),
  current: z.array(z.string()).min(1).max(10),
  proposed: z.array(z.string()).min(1).max(10),
  dryYears: z.number().int().min(0).optional(),
  ofYears: z.number().int().positive().max(100).optional(),
}).refine(i => (i.dryYears === undefined) === (i.ofYears === undefined), 'Give dryYears and ofYears together.')
  .refine(i => i.dryYears === undefined || i.dryYears <= i.ofYears!, 'dryYears cannot exceed ofYears.')
/** Validated risk check input. */
export type RiskInput = z.infer<typeof riskInput>

/** A range the track record can check later. */
export interface Ranged { value: number; low: number; high: number }
/** Evidence plus the blockers, and the per-acre changes to save as an estimate. */
export type RiskResult = EvidenceResult & { blockers: string[]; estimate: { field: string; change: string; unit: string; example: boolean; normal: Ranged; dry: Ranged } }

const ALIASES: Record<string, string> = { soybeans: 'soybean', soy: 'soybean', milo: 'sorghum', 'grain sorghum': 'sorghum', 'winter wheat': 'wheat', 'hard red winter wheat': 'wheat', maize: 'corn' }
const normalize = (crops: readonly string[]) => crops.map(c => { const k = c.trim().toLowerCase(); return ALIASES[k] ?? k })

/**
 * Compare a proposed rotation with the current one on one field.
 * @param input - field, acres, both rotations as crop lists (one entry per year), and optionally how many recent years were dry.
 * @param model - crop table and tunables.
 * @returns an evidence result; figures are examples when the crop table is.
 * @throws HarnessError `RISK_INPUT` for crops outside the table or invalid input.
 */
export function riskCheck(input: RiskInput, model: RiskModel): RiskResult {
  const parsed = riskInput.safeParse(input)
  if (!parsed.success) throw new HarnessError(parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), 'RISK_INPUT')
  const { field, acres, dryYears, ofYears } = parsed.data
  const current = normalize(input.current), proposed = normalize(input.proposed)
  const unknown = [...new Set([...current, ...proposed])].filter(c => !(c in model.crops))
  if (unknown.length > 0) throw new HarnessError(`Unknown crop(s): ${unknown.join(', ')}. Known: ${Object.keys(model.crops).join(', ')}.`, 'RISK_INPUT')
  const returns = (crops: string[]) => {
    const p = crops.map(c => model.crops[c]!)
    const mean = (pick: (c: CropProfile) => number) => p.reduce((s, c) => s + pick(c), 0) / p.length
    return { normal: mean(c => c.normal), dry: mean(c => c.dry) + model.diversityDryCredit * Math.max(0, new Set(crops).size - 2) }
  }
  const today = returns(current), next = returns(proposed)
  const normalDelta = next.normal - today.normal, dryDelta = next.dry - today.dry
  const table = model.cropsAreExamples ? 'example' : 'budgets'
  const spread = (value: number): Ranged => { const s = Math.abs(value) * model.relativeUncertainty; return { value: Math.round(value), low: Math.round(value - s), high: Math.round(value + s) } }
  const figure = (label: string, value: number, unit: string, method: string, sources: string[]): Figure => ({ label, ...spread(value), unit, method, sources, ...(model.cropsAreExamples ? { example: true } : {}) })
  const method = 'Mean return per year of each rotation from the crop table; dry years add a credit per distinct crop beyond two.'
  const figures = [
    figure('Normal-year change vs. today', normalDelta, 'USD/acre', method, [table]),
    figure('Dry-year change vs. today', dryDelta, 'USD/acre', method, [table, 'bowles2020']),
  ]
  if (dryYears !== undefined && ofYears !== undefined) {
    const share = dryYears / ofYears
    figures.push(figure(`Average year, if dry years come as often as the last ${ofYears} (${dryYears} dry)`, share * dryDelta + (1 - share) * normalDelta, 'USD/acre', `${dryYears}/${ofYears} of the dry-year change plus the rest of the normal-year change.`, [table, 'history']))
  }
  figures.push(figure(`Worst single year on ${field}`, Math.min(normalDelta, dryDelta) * acres, 'USD', `The lower of the two changes times ${acres} acres.`, [table]))
  const blockers = [...new Set(proposed.filter(c => !current.includes(c)).flatMap(c => model.crops[c]!.blockers))]
  const label = model.cropsAreExamples ? ' (example numbers)' : ''
  const change = `${proposed.join('-')} instead of ${current.join('-')}`
  // Spelled out: a pair of "$" in chat Markdown renders as math.
  const usd = (n: number) => `${Math.abs(Math.round(n))} USD/acre`
  const often = dryYears !== undefined ? ` Dry years came ${dryYears} of the last ${ofYears} on this field.` : ''
  return {
    summary: `On ${field} (${acres} acres), ${change}: ${dryDelta >= 0 ? 'better' : 'worse'} in a dry year by about ${usd(dryDelta)}, and ${normalDelta >= 0 ? 'gains' : 'gives up'} about ${usd(normalDelta)} in a normal year${label}.${often} ${blockers.length} blocker(s) to solve first.`,
    figures,
    sources: RISK_SOURCES.filter(s => figures.some(f => f.sources?.includes(s.id))),
    limits: [
      ...(model.cropsAreExamples ? ['Crop economics are example numbers, not this state\'s budgets.'] : []),
      'Ignores prices changing, hail, wet springs, grain quality, and management differences.',
      'The diversity credit follows the direction of the Bowles et al. finding, not its size.',
      'Past dry years say how often they came, not how often they will.',
      'Does not predict yield; it compares returns from the crop table only.',
    ],
    blockers,
    estimate: { field, change, unit: 'USD/acre', example: model.cropsAreExamples, normal: spread(normalDelta), dry: spread(dryDelta) },
  }
}
