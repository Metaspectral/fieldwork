/** Crop Experiments: native planning and observation tools anchored to a retained baseline. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { draftTrial, FarmError } from './records.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'
/** Native experiment plugin identity. */
export const name = 'fieldwork-crop-experiments'
/** Required native tool and private-record services. */
export const inject = ['tools', 'farmRecords']
/** Register trial creation, adaptation, tracking, and observations as separate decisions. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({ name: 'list_crop_experiments', description: 'Read the latest twenty private experiments, with observations and source attribution. Read-only.', parameters: {}, output: jsonOutput, async execute() { const trials = ctx.farmRecords.snapshot().trials; return JSON.stringify({ trials: trials.slice(-20), omitted: Math.max(0, trials.length - 20) }) } }))
  approve(ctx, ['plan_crop_trial', 'edit_crop_trial', 'start_crop_tracking', 'record_crop_observation'])
  ctx.tools.register(defineTool({ name: 'plan_crop_trial', description: 'Save a private trial draft against the current farm approach. Calculates retained area only; does not recommend a suitable crop or predict yield. Requires approval.', parameters: { title: { type: 'string', required: true, description: 'The question being tested.' }, change: { type: 'string', required: true, description: 'One farmer-selected alternative to explore.' }, trialAreaHa: { type: 'number', required: true, description: 'Area in hectares, positive and no larger than the farm.' } }, output: jsonOutput, async execute(args) { return checked(async () => {
    let id = ''
    const state = await ctx.farmRecords.change(s => {
      z.number().positive().max(s.farm.areaHa).parse(args.trialAreaHa)
      const trial = draftTrial(args.title, `${s.farm.crop}: ${s.farm.approach} Reason: ${s.farm.reason}`, `${args.change} Trial area: ${args.trialAreaHa} ha; retain ${s.farm.areaHa - args.trialAreaHa} ha of the current approach.`, 'Farmer-authored method v1')
      id = trial.id; s.trials.push(trial)
    })
    return state.trials.find(t => t.id === id)
  }) } }))
  ctx.tools.register(defineTool({ name: 'edit_crop_trial', description: 'Adapt a private draft to the farmer’s own baseline and proposed change. Keeps source attribution; tracked methods cannot be rewritten. Requires approval.', parameters: { id: { type: 'string', required: true, description: 'Draft experiment ID.' }, title: { type: 'string', required: true, description: 'Experiment title.' }, baseline: { type: 'string', required: true, description: 'The farmer’s current practice.' }, change: { type: 'string', required: true, description: 'One proposed change.' } }, output: jsonOutput, async execute(args) { return checked(async () => (await ctx.farmRecords.change(s => { const t = s.trials.find(t => t.id === args.id); if (!t || t.status !== 'draft') throw new FarmError('Choose an existing draft; tracked methods remain fixed.', 'FARM_INPUT'); t.title = args.title; t.baseline = args.baseline; t.change = args.change })).trials.find(t => t.id === args.id)) } }))
  ctx.tools.register(defineTool({ name: 'start_crop_tracking', description: 'Approve recording observations for a draft. This neither approves a treatment nor schedules physical farm work. Requires approval.', parameters: { id: { type: 'string', required: true, description: 'Experiment ID.' } }, output: jsonOutput, async execute(args) { return checked(async () => (await ctx.farmRecords.change(s => { const t = s.trials.find(t => t.id === args.id); if (!t) throw new FarmError('Experiment not found.', 'FARM_INPUT'); t.status = 'tracking' })).trials.find(t => t.id === args.id)) } }))
  ctx.tools.register(defineTool({ name: 'record_crop_observation', description: 'Save a private measurement, condition, or deviation on a tracking experiment. Keep interpretations distinct from observed facts. Requires approval.', parameters: { id: { type: 'string', required: true, description: 'Tracking experiment ID.' }, observation: { type: 'string', required: true, description: 'An observation, with units and date when known; maximum 2000 characters.' } }, output: jsonOutput, async execute(args) { return checked(async () => (await ctx.farmRecords.change(s => { const t = s.trials.find(t => t.id === args.id); if (!t || t.status !== 'tracking') throw new FarmError('Start tracking before recording an observation.', 'FARM_INPUT'); t.observations.push(args.observation) })).trials.find(t => t.id === args.id)) } }))
}
