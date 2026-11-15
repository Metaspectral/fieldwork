/** Seed Costs: deterministic comparisons in native tool cards. */
import type { Context } from '@deepseek-ai/cordis'
import { seedComparison } from './records.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'
/** Native seed-cost plugin identity. */
export const name = 'fieldwork-seed-costs'
/** Native tools and local comparison records. */
export const inject = ['tools', 'farmRecords']
/** Register explicit purchase-cost comparison and approved retention. */
export function apply(ctx: Context): void {
  approve(ctx, ['save_seed_comparison'])
  const parameters = { areaHa: { type: 'number' as const, required: true as const, description: 'Positive area in hectares.' }, bagsPerHa: { type: 'number' as const, required: true as const, description: 'Same positive bags per hectare assumed for both products.' }, currentCadPerBag: { type: 'number' as const, required: true as const, description: 'Current quote in CAD per bag, zero or greater.' }, alternativeCadPerBag: { type: 'number' as const, required: true as const, description: 'Alternative quote in CAD per bag, zero or greater.' } }
  ctx.tools.register(defineTool({ name: 'compare_seed_quotes', description: 'Compare seed purchase costs in CAD. Does not save a record or infer equivalent quality, suitability, yield, or profit.', parameters, output: jsonOutput, async execute(a) { return checked(() => seedComparison(a.areaHa, a.bagsPerHa, a.currentCadPerBag, a.alternativeCadPerBag)) } }))
  ctx.tools.register(defineTool({ name: 'save_seed_comparison', description: 'Save a reproducible seed purchase-cost comparison with version, inputs, and result. Requires approval.', parameters, output: jsonOutput, async execute(a) { return checked(async () => { const comparison = seedComparison(a.areaHa, a.bagsPerHa, a.currentCadPerBag, a.alternativeCadPerBag); await ctx.farmRecords.change(s => { s.comparisons = [...s.comparisons, comparison].slice(-20) }); return comparison }) } }))
}
