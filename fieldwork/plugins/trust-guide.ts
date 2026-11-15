/**
 * Trust guide: tells the agent how much to volunteer, notes what the farmer looks at, and keeps
 * Fieldwork's track record. It never blocks a tool; a farmer's request always goes through.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import schema from '@deepseek-ai/schemastery'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { checkEstimate, DEFAULT_RULES, evaluate, forget, note, NOTED_SIGNALS, PACES, promptSection, SIGNAL_KINDS, trackRecord, TrustError, type Pace, type SignalKind, type StageRules } from './trust.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'

/** Native trust-guide plugin identity. */
export const name = 'fieldwork-trust-guide'
/** Agent tools and prompt; trust state belongs to the Host. */
export const inject = ['tools', 'systemPrompt', 'trustRecords']

/** Trust-guide configuration. */
export interface Config {
  /** Successful calls of these tools note the mapped signal automatically. */
  autoSignals: Record<string, SignalKind>
  /** When each stage applies. */
  rules: StageRules
}

/** Tool use that counts by default: Jon's field history, the risk check, sources, and Daniel's trials. */
export const DEFAULT_AUTO_SIGNALS: Record<string, SignalKind> = {
  field_history: 'history_viewed', year_detail: 'history_viewed', field_risks: 'history_viewed',
  correct_year: 'history_corrected', save_field_note: 'history_corrected',
  risk_check: 'risk_viewed', show_source: 'source_opened',
  plan_crop_trial: 'trial_saved', record_crop_observation: 'outcome_recorded',
}

/** Validate signal mappings and thresholds at composition time. */
export const Config: schema<Config> = schema.object({
  autoSignals: schema.dict(schema.union(SIGNAL_KINDS.map(s => schema.const(s)))).default(DEFAULT_AUTO_SIGNALS),
  rules: schema.object({
    evidenceForExplain: schema.natural().default(DEFAULT_RULES.evidenceForExplain),
    curiosityForTrial: schema.natural().default(DEFAULT_RULES.curiosityForTrial),
    risksForTrial: schema.natural().default(DEFAULT_RULES.risksForTrial),
    trialsForPlan: schema.natural().default(DEFAULT_RULES.trialsForPlan),
    outcomesForPlan: schema.natural().default(DEFAULT_RULES.outcomesForPlan),
    quietAfterDecline: schema.natural().default(DEFAULT_RULES.quietAfterDecline),
  }).default(DEFAULT_RULES),
}) as schema<Config>

/** Register the prompt section, automatic signals, and the trust tools. */
export function apply(ctx: Context, config: Config): void {
  const trust = ctx.trustRecords
  const status = () => evaluate(trust.snapshot(), config.rules)
  const noted: readonly string[] = NOTED_SIGNALS

  ctx.systemPrompt.section({ name: 'fieldwork:trust-guide', order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') - 1, text: () => promptSection(status()), interpolate: false })

  // Awaited before the result reaches the model, so the next prompt already reflects the signal.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    const kind = config.autoSignals[exec.name]
    if (kind !== undefined && decision.kind === 'accept' && !result.isError) {
      try { await trust.change(s => note(s, { kind, detail: exec.name }, new Date())) }
      catch (error) { ctx.logger.warn('trust signal not saved: %s', error) } // A lost signal only changes how much is volunteered; the tool result stands.
    }
    return decision
  })

  ctx.tools.register(defineTool({ name: 'trust_status', description: 'Read how much Fieldwork volunteers right now and why, what would change it, the counted signals, saved estimates, and the track record. Read-only. Use it to answer "why did you suggest that?" or "what do you keep about me?".', parameters: {}, output: jsonOutput, async execute() {
    const s = trust.snapshot()
    return JSON.stringify({ ...status(), estimates: s.estimates.slice(-10).map(e => ({ id: e.id, at: e.at.slice(0, 10), field: e.field, change: e.change, unit: e.unit, example: e.example, normal: e.normal, dry: e.dry, checked: e.checked ?? null })), privacy: 'Stored only in this runtime. Never shared with buyers, lenders or insurers. trust_forget deletes it.' })
  } }))
  ctx.tools.register(defineTool({
    name: 'trust_note',
    description: 'Note something the farmer just did in conversation: asked "why?" or "how do you know?" (question_asked), took up a suggestion (suggestion_accepted), or turned one down or ignored it (suggestion_declined). Only note what the farmer actually did.',
    parameters: {
      kind: { type: 'string', enum: [...NOTED_SIGNALS], required: true, description: 'What the farmer did.' },
      detail: { type: 'string', description: 'Short note, e.g. the question. No private details.' },
    },
    output: jsonOutput,
    async execute(a) {
      return checked(async () => {
        if (!noted.includes(a.kind)) throw new TrustError(`kind must be one of ${noted.join(', ')}.`, 'TRUST_INPUT')
        return evaluate(await trust.change(s => note(s, { kind: a.kind as SignalKind, ...(a.detail === undefined ? {} : { detail: a.detail.slice(0, 500) }) }, new Date())), config.rules)
      })
    },
  }))
  // Asking for less never needs approval; going back to auto lets Fieldwork volunteer more, so the farmer confirms it.
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const decision = await next()
    if (decision.kind !== 'allow' || exec.name !== 'trust_set_pace' || (exec.arguments as { pace?: unknown }).pace !== 'auto') return decision
    return { kind: 'ask', reason: 'Let Fieldwork volunteer more again as you use it: a short "why", one thing worth a look, and later a small trial. You can set it back to quiet at any time.' }
  })
  ctx.tools.register(defineTool({
    name: 'trust_set_pace',
    description: 'Set how much Fieldwork volunteers. quiet: only answer what the farmer asks, never suggest. auto: volunteer a little more as the farmer uses Fieldwork (needs the farmer\'s approval). Use quiet whenever the farmer wants less.',
    parameters: { pace: { type: 'string', enum: [...PACES], required: true, description: 'quiet or auto.' } },
    output: jsonOutput,
    async execute(a) { return checked(async () => evaluate(await trust.change(s => ({ ...s, pace: a.pace as Pace })), config.rules)) },
  }))
  approve(ctx, ['check_estimate'], args => {
    const a = args as { id?: string; yearWas?: string; actual?: number }
    const e = trust.snapshot().estimates.find(x => x.id === a.id)
    return e ? `Record that "${e.change}" on ${e.field} came out at ${a.actual} ${e.unit} in a ${a.yearWas} year, and compare it with Fieldwork's estimate from ${e.at.slice(0, 10)}.` : JSON.stringify(args)
  })
  ctx.tools.register(defineTool({
    name: 'check_estimate',
    description: 'Compare a saved estimate (from risk_check; ids in trust_status) with what the farmer saw after the season, e.g. the trial strip\'s return minus the rest of the field. Reports whether it landed inside the range. Requires approval.',
    parameters: {
      id: { type: 'string', required: true, description: 'Estimate id.' },
      yearWas: { type: 'string', enum: ['normal', 'dry'], required: true, description: 'Whether the season was normal or dry.' },
      actual: { type: 'number', required: true, description: 'The result the farmer saw, in the estimate\'s unit.' },
      detail: { type: 'string', description: 'What happened, in the farmer\'s words.' },
    },
    output: jsonOutput,
    async execute(a) {
      return checked(async () => {
        const s = await trust.change(x => checkEstimate(x, a.id, a.yearWas as 'normal' | 'dry', a.actual, a.detail?.slice(0, 500), new Date()))
        const e = s.estimates.find(x => x.id === a.id)!
        const r = e[e.checked!.yearWas]
        return { id: e.id, field: e.field, change: e.change, unit: e.unit, estimated: r, actual: e.checked!.actual, landedInRange: e.checked!.hit, example: e.example, trackRecord: trackRecord(s.estimates).text }
      })
    },
  }))
  approve(ctx, ['trust_forget'], args => {
    const s = trust.snapshot()
    return (args as { what?: string }).what === 'all' ? `Delete ${s.signals.length} noted signal(s) and ${s.estimates.length} saved estimate(s), including the track record.` : `Delete ${s.signals.length} noted signal(s). Saved estimates and the track record stay.`
  })
  ctx.tools.register(defineTool({
    name: 'trust_forget',
    description: 'Delete what Fieldwork noted about how the farmer uses it (signals), or that plus every saved estimate and the track record (all). The pace setting stays. Requires approval.',
    parameters: { what: { type: 'string', enum: ['signals', 'all'], required: true, description: 'signals or all.' } },
    output: jsonOutput,
    async execute(a) { return checked(async () => evaluate(await trust.change(s => forget(s, a.what as 'signals' | 'all')), config.rules)) },
  }))
}
