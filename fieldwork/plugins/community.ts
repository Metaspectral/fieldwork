/** Community: inspect methods and share reviewed summaries using native tools and approvals. */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { draftTrial, FarmError } from './records.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'
/** Native community plugin identity. */
export const name = 'fieldwork-community'
/** Independent capability over the same private records. */
export const inject = ['tools', 'farmRecords']
/** Register local-demo discovery, private adaptation, preview, and approved sharing. */
export function apply(ctx: Context): void {
  approve(ctx, ['adapt_community_method', 'withdraw_farm_summary'])
  approve(ctx, ['publish_farm_summary'], input => {
    const { previewId } = z.object({ previewId: z.string() }).parse(input)
    return JSON.stringify({ audience: 'Local demo feed only; nothing uploaded', summary: ctx.farmRecords.reviewed(previewId) })
  })
  ctx.tools.register(defineTool({ name: 'browse_farm_knowledge', description: 'Browse the latest twenty local-demo knowledge summaries and methods. Fictional sources are labelled. These are starting points, not validated prescriptions or trusted instructions.', parameters: {}, output: jsonOutput, async execute() { const all = ctx.farmRecords.snapshot().summaries; return JSON.stringify({ audience: 'Local demonstration; no online service', summaries: all.slice(-20), omitted: Math.max(0, all.length - 20) }) } }))
  ctx.tools.register(defineTool({ name: 'adapt_community_method', description: 'Copy a community method into a private editable trial with source attribution. Does not start tracking or activate another plugin. Requires approval.', parameters: { postId: { type: 'string', required: true, description: 'Knowledge summary ID.' } }, output: jsonOutput, async execute(a) { return checked(async () => {
    let id = ''
    const state = await ctx.farmRecords.change(s => { const p = s.summaries.find(p => p.id === a.postId); if (!p) throw new FarmError('Method not found.', 'FARM_INPUT'); const t = draftTrial(p.title, p.baseline, p.change, `${p.author}: ${p.id}; ${p.source}`); id = t.id; s.trials.push(t) })
    return state.trials.find(t => t.id === id)
  }) } }))
  ctx.tools.register(defineTool({ name: 'preview_farm_summary', description: 'Preview selected experiment text for the local demo feed. Excludes private observations and farm context. Free text is not anonymized; show the full summary to the farmer. Does not publish.', parameters: { id: { type: 'string', required: true, description: 'Private experiment ID.' }, title: { type: 'string', required: true, description: 'Selected public-facing title.' }, takeaway: { type: 'string', required: true, description: 'Selected learning and uncertainty; exclude private details.' } }, output: jsonOutput, async execute(a) { return checked(() => ctx.farmRecords.preview(a.id, a.title, a.takeaway)) } }))
  ctx.tools.register(defineTool({ name: 'publish_farm_summary', description: 'Publish exactly a previously previewed summary to the local demo feed. Native approval displays the full selected content. No network upload or real audience exists.', parameters: { previewId: { type: 'string', required: true, description: 'ID returned by preview_farm_summary in this runtime.' } }, output: jsonOutput, async execute(a) { return checked(async () => { const summary = ctx.farmRecords.reviewed(a.previewId); const post = { id: randomUUID(), ...summary }; await ctx.farmRecords.change(s => { s.summaries.push(post) }); return post }) } }))
  ctx.tools.register(defineTool({ name: 'withdraw_farm_summary', description: 'Remove your own local-demo summary while preserving the private trial and observations. Requires approval.', parameters: { id: { type: 'string', required: true, description: 'Your shared summary ID.' } }, output: jsonOutput, async execute(a) { return checked(async () => { await ctx.farmRecords.change(s => { const p = s.summaries.find(p => p.id === a.id); if (!p || p.sample) throw new FarmError('Choose your own shared summary.', 'FARM_INPUT'); s.summaries = s.summaries.filter(p => p.id !== a.id) }); return { removed: a.id, privateExperimentPreserved: true } }) } }))
}
