/** My Farm: native tools for preserving the farmer's current approach and reasons. */
import type { Context } from '@deepseek-ai/cordis'
import { farmSchema } from './records.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'
/** Native plugin identity shown in the preset component list. */
export const name = 'fieldwork-my-farm'
/** Tools belong to the agent; farm records belong to the Host. */
export const inject = ['tools', 'farmRecords']
/** Register farm context and a separately approved context update. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({ name: 'read_my_farm', description: 'Read the farmer’s current crop, approach, local constraints, and reasoning. These are farmer-reported context, not independently validated agronomic claims.', parameters: {}, output: jsonOutput, async execute() { return JSON.stringify(ctx.farmRecords.snapshot().farm) } }))
  approve(ctx, ['update_my_farm'])
  ctx.tools.register(defineTool({ name: 'update_my_farm', description: 'Save a farmer-confirmed current approach and its reasons. Native user approval is required. Existing experiments are not rewritten.', parameters: {
    name: { type: 'string', required: true, description: 'Farm name.' }, region: { type: 'string', required: true, description: 'Broad region; avoid exact locations.' }, areaHa: { type: 'number', required: true, description: 'Farm area in hectares, greater than zero.' }, crop: { type: 'string', required: true, description: 'Current main crop.' }, approach: { type: 'string', required: true, description: 'What the farmer currently does.' }, reason: { type: 'string', required: true, description: 'Why they use this approach, including observations and constraints.' },
  }, output: jsonOutput, async execute(args) { return checked(async () => (await ctx.farmRecords.change(s => { s.farm = farmSchema.parse(args) })).farm) } }))
}
