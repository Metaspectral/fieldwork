/** Rotation: regional crop orders with sources, and farmer-entered budget comparisons, as native tools. */
import type { Context } from '@deepseek-ai/cordis'
import { rotationLibrary, rotationName, fieldRotation } from './rotation-domain.ts'
import { acceptRotation, proposeRotation } from './rotation-planning.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'
/** Native rotation plugin identity. */
export const name = 'fieldwork-rotation'
/** Native tools and local farm records. */
export const inject = ['tools', 'farmRecords']
const template = { fieldId: 'field id', season: 2027, reason: 'the farmer’s reason in their words', choice: 'current | alternative', startIndex: 0, evidence: 'farmer-reported | assumed | demo', supersedes: 'optional earlier plan id for the same field', inputs: { areaHa: 'the field’s confirmed area in hectares', landCost: 'per acre', currency: 'USD | CAD', current: { rotationId: 'optional library id', crops: ['corn', 'soybean'], source: { kind: 'published-study | community | experiment | farmer', citation: 'copy from the library, or “Farmer’s own rotation”' }, columns: [{ yield: 'per acre', price: 'per unit', otherIncome: 'per acre, optional', costs: 'costs before land, per acre' }] }, alternative: 'optional, same fields as current' } }
/**
 * Register read tools and approved rotation-plan mutations.
 * @param ctx - Plugin context with the tool registry and farm records.
 */
export function apply(ctx: Context): void {
  approve(ctx, ['propose_rotation_plan', 'accept_rotation_plan'])
  ctx.tools.register(defineTool({ name: 'list_regional_rotations', description: 'List the crop rotations on file for the region, each with its source and limits, plus the proposal template. Crop orders only: no prices, yields or returns, and no claim that a rotation is common, better or more profitable.', parameters: {}, output: jsonOutput, async execute() { return checked(() => ({ region: rotationLibrary.region, rotations: rotationLibrary.rotations.map(r => ({ ...r, name: rotationName(r.crops) })), proposalTemplate: template })) } }))
  ctx.tools.register(defineTool({ name: 'read_rotation_plans', description: 'Read saved rotation plans and the rotation each field follows now. Budgets add up farmer-entered numbers per acre; they are not predictions.', parameters: { fieldId: { type: 'string', description: 'Limit to one field.' } }, output: jsonOutput, async execute(a) { return checked(() => { const s = ctx.farmRecords.snapshot(); return { plans: s.rotationPlans.filter(p => !a.fieldId || p.fieldId === a.fieldId), following: s.fields.filter(f => !a.fieldId || f.id === a.fieldId).map(f => ({ fieldId: f.id, field: f.name, planId: fieldRotation(s.rotationPlans, f.id)?.id ?? null })) } }) } }))
  ctx.tools.register(defineTool({ name: 'propose_rotation_plan', description: 'Save a private proposed rotation plan for one field: keep the current rotation or switch, with the farmer’s own prices, yields and costs. Requires approval. Call list_regional_rotations first. Never invent a number; leave it out.', parameters: { proposal: { type: 'json', required: true, description: 'Object matching proposalTemplate from list_regional_rotations.' } }, output: jsonOutput, async execute(a) { return checked(() => proposeRotation(ctx.farmRecords, a.proposal)) } }))
  ctx.tools.register(defineTool({ name: 'accept_rotation_plan', description: 'Accept a reviewed rotation proposal; the field then follows its chosen rotation. Blank numbers in a comparison, a changed field area, and demo numbers on a real field block acceptance. Requires approval; does not schedule farm work.', parameters: { id: { type: 'string', required: true } }, output: jsonOutput, async execute(a) { return checked(async () => ({ plan: (await acceptRotation(ctx.farmRecords, a.id)).rotationPlans.find(p => p.id === a.id) })) } }))
}
