/**
 * Risk Check: dry-year dollars, blockers and sources for one change on one field, as native
 * tool cards. Read-only: the result carries an estimate that the farmer can choose to save
 * (save_estimate, with approval) and later compare with what happened (check_estimate).
 */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-error'
import { asEvidence } from './evidence.ts'
import { EXAMPLE_CROPS, RISK_SOURCES, riskCheck, type RiskModel } from './risk.ts'
import { trackRecord } from './trust.ts'
import { checked, defineTool } from './native.ts'

/** Native risk-check plugin identity. */
export const name = 'fieldwork-risk-check'
/** Native tools; reads the track record from the Host-owned trust records. */
export const inject = ['tools', 'trustRecords']
/** Crop table and tunables; the default table is example data. */
export type Config = RiskModel
/** Validate the crop table at composition time. */
export const Config: schema<Config> = schema.object({
  crops: schema.dict(schema.object({ normal: schema.number().required(), dry: schema.number().required(), blockers: schema.array(schema.string()).default([]) })).default(EXAMPLE_CROPS),
  cropsAreExamples: schema.boolean().default(true),
  diversityDryCredit: schema.number().min(0).default(15),
  relativeUncertainty: schema.number().min(0).max(1).default(0.3),
})

const fmt = (n: number | undefined) => n === undefined ? '?' : n.toLocaleString('en-US')
/** Farmer- and model-facing text: summary, figures with ranges and sources, blockers, limits, and the track record. */
const riskOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => {
    const r = asEvidence(value)
    if (!r) return [{ type: 'text' as const, text: value }]
    const blockers = Array.isArray(r.blockers) ? r.blockers.map(String) : []
    const text = [
      r.summary,
      ...r.figures.map(f => `- ${f.label}${f.example ? ' (EXAMPLE)' : ''}: ${fmt(f.value)} ${f.unit} (range ${fmt(f.low)} to ${fmt(f.high)}; sources ${(f.sources ?? []).join(', ')})`),
      ...(blockers.length ? ['Blockers to solve first:', ...blockers.map(b => `- ${b}`)] : []),
      ...(r.limits?.length ? ['Limits:', ...r.limits.map(l => `- ${l}`)] : []),
      `Sources: ${r.sources.map(s => s.id).join(', ')} (show_source gives details).`,
      ...(typeof r.trackRecord === 'string' ? [`Track record on this farm: ${r.trackRecord}`] : []),
    ].join('\n')
    return [{ type: 'text' as const, text }]
  },
}
const textOutput = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }

/** Register the risk check and source lookup. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'risk_check',
    description: `What one change on one field could cost: normal-year and dry-year change in USD/acre, an average year using how often this field had dry years, the worst single year in USD, blockers to solve first, and sources. Run field_risks first and pass its drought-and-heat count as dryYears/ofYears. Read-only; save_estimate keeps the result to check after the season. Does not predict yield or recommend a crop. Known crops: ${Object.keys(config.crops).join(', ')}.${config.cropsAreExamples ? ' The crop table is EXAMPLE data.' : ''}`,
    parameters: {
      field: { type: 'string', required: true, description: 'Field name the farmer uses.' },
      acres: { type: 'number', required: true, description: 'Field area in acres, greater than zero.' },
      current: { type: 'array', items: { type: 'string' }, required: true, description: 'Current rotation, one crop per year, e.g. ["corn", "corn", "soybean"]. Use the field history.' },
      proposed: { type: 'array', items: { type: 'string' }, required: true, description: 'Proposed rotation, one crop per year, e.g. ["corn", "sorghum", "soybean"].' },
      dryYears: { type: 'integer', description: 'Years marked bad for drought and heat in the recent period, from field_risks.' },
      ofYears: { type: 'integer', description: 'Length of that recent period in years, from field_risks.' },
    },
    output: riskOutput,
    async execute(a) {
      return checked(() => ({ ...riskCheck(a, config), trackRecord: trackRecord(ctx.trustRecords.snapshot().estimates).text }))
    },
  }))
  ctx.tools.register(defineTool({
    name: 'show_source',
    description: 'Show where a number comes from: the full title, year and link of a source id cited by risk_check. Use when the farmer asks for a source.',
    parameters: { id: { type: 'string', required: true, description: `Source id: ${RISK_SOURCES.map(s => s.id).join(', ')}.` } },
    output: textOutput,
    async execute(a) {
      const source = RISK_SOURCES.find(s => s.id === a.id)
      if (!source) throw new HarnessError(`Unknown source "${a.id}". Known: ${RISK_SOURCES.map(s => s.id).join(', ')}.`, 'RISK_INPUT')
      return JSON.stringify(source)
    },
  }))
}
