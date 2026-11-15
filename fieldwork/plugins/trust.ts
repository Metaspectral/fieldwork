/**
 * Trust guideline: be useful first, and let trust follow from being right where the farmer can check.
 *
 * Nothing is locked. The farmer can ask for anything at any time. What changes is how much
 * Fieldwork volunteers unprompted: the stage follows what the farmer has looked at and asked,
 * and drops back after they turn a suggestion down. Fieldwork also keeps its own estimates and,
 * once the farmer reports what happened, its track record. Everything stays in this runtime.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-error'

/** How much Fieldwork volunteers, lowest first. */
export type Stage = 1 | 2 | 3 | 4

/** What Fieldwork may volunteer at each stage, for the farmer and for the model. */
export const STAGES: Record<Stage, { readonly name: string; readonly farmer: string; readonly agent: string }> = {
  1: { name: 'Show what happened', farmer: 'Answers what you ask, with your field\'s history, risks and sources.', agent: 'Answer what was asked, with history, risks and sources. Do not volunteer changes or plans.' },
  2: { name: 'Explain', farmer: 'Also adds a one-line "why" and points out one thing worth a closer look.', agent: 'You may add, unprompted, a one-line reason behind a finding with its source, and point out one thing worth a closer look. Do not volunteer changes yet.' },
  3: { name: 'Suggest a small trial', farmer: 'Offers one small trial on one field, once, with its dry-year dollars and blockers.', agent: 'If you have not offered a trial in this conversation yet, end this reply with one short offer: one small trial on one field, with its dry-year dollars (say when they are examples), its blockers and the track record. Offer it once; the rest of the farm keeps the current approach.' },
  4: { name: 'Talk about a plan', farmer: 'May bring up a multi-year plan, approved one year at a time.', agent: 'You may bring up a multi-year plan when it fits, one year at a time, with what to watch for each year.' },
}

/** Things the farmer did that shape how much Fieldwork volunteers. */
export const SIGNAL_KINDS = ['history_viewed', 'history_corrected', 'risk_viewed', 'source_opened', 'question_asked', 'suggestion_accepted', 'suggestion_declined', 'trial_saved', 'outcome_recorded'] as const
/** One kind of signal. */
export type SignalKind = typeof SIGNAL_KINDS[number]
/** Signals the model notes from the conversation; the rest come from tool use automatically. */
export const NOTED_SIGNALS = ['question_asked', 'suggestion_accepted', 'suggestion_declined'] as const satisfies readonly SignalKind[]
/** The farmer's own setting: `auto` follows the stages, `quiet` never volunteers beyond stage 1. */
export const PACES = ['auto', 'quiet'] as const
/** One pace setting. */
export type Pace = typeof PACES[number]

const range = z.object({ value: z.number().finite(), low: z.number().finite(), high: z.number().finite() })
const signalSchema = z.object({ kind: z.enum(SIGNAL_KINDS), at: z.string(), detail: z.string().max(500).optional() })
const estimateSchema = z.object({
  id: z.string(),
  at: z.string(),
  field: z.string().max(200),
  change: z.string().max(500),
  unit: z.string().max(40),
  example: z.boolean(),
  normal: range,
  dry: range,
  checked: z.object({ at: z.string(), yearWas: z.enum(['normal', 'dry']), actual: z.number().finite(), hit: z.boolean(), note: z.string().max(500).optional() }).optional(),
})
const stateSchema = z.object({ version: z.literal(2), pace: z.enum(PACES), signals: z.array(signalSchema), estimates: z.array(estimateSchema) })
/** One recorded signal. */
export type Signal = z.infer<typeof signalSchema>
/** One saved estimate, and how it turned out once checked. */
export type Estimate = z.infer<typeof estimateSchema>
/** Persisted trust state for the farmer using this runtime. */
export type TrustState = z.infer<typeof stateSchema>
/** Oldest signals are dropped past this many, bounding the file. */
export const SIGNAL_LIMIT = 500
/** Oldest unchecked estimates are dropped past this many. */
export const ESTIMATE_LIMIT = 200

/** Thresholds for each stage. */
export interface StageRules {
  /** History views, corrections, risk checks and sources before stage 2. */
  evidenceForExplain: number
  /** Questions and sources before stage 3. */
  curiosityForTrial: number
  /** Risk checks the farmer asked for before stage 3. */
  risksForTrial: number
  /** Trials saved before stage 4. */
  trialsForPlan: number
  /** Outcomes recorded or estimates checked before stage 4. */
  outcomesForPlan: number
  /** After a declined suggestion, signals before suggesting again. */
  quietAfterDecline: number
}

/** Default thresholds. */
export const DEFAULT_RULES: StageRules = { evidenceForExplain: 2, curiosityForTrial: 2, risksForTrial: 1, trialsForPlan: 1, outcomesForPlan: 1, quietAfterDecline: 5 }

/** How Fieldwork's checked estimates held up. */
export interface TrackRecord { checked: number; hits: number; text: string }

/** What Fieldwork volunteers right now, and why. */
export interface PaceView {
  stage: Stage
  stageName: string
  /** What Fieldwork may volunteer, in the farmer's words. */
  volunteers: string
  pace: Pace
  counts: Record<SignalKind, number>
  trackRecord: TrackRecord
  /** Why the stage is what it is, in plain language. */
  why: string[]
  /** What would change it next, or null at the top. */
  next: string | null
}

/** Domain failures routed through the native tool-result pipeline. */
export class TrustError extends HarnessError {
  /** Keep a stable domain code and optional cause. */
  constructor(message: string, code: 'TRUST_INPUT' | 'TRUST_STORAGE', cause?: unknown) { super(message, code, cause === undefined ? undefined : { cause }); this.name = 'TrustError' }
}

/** @returns an empty state that follows the stages. */
export function initialState(): TrustState { return { version: 2, pace: 'auto', signals: [], estimates: [] } }

/**
 * Score checked estimates: a hit is an actual result inside the range given for that kind of year.
 * @param estimates - all saved estimates.
 * @returns counts and one plain sentence.
 */
export function trackRecord(estimates: readonly Estimate[]): TrackRecord {
  const done = estimates.filter(e => e.checked)
  const hits = done.filter(e => e.checked!.hit).length
  const example = done.some(e => e.example) ? ' Those estimates used example numbers.' : ''
  const text = done.length === 0 ? 'No estimates checked against a real season yet.' : `${hits} of ${done.length} checked estimate(s) landed inside their range.${example}`
  return { checked: done.length, hits, text }
}

const need = (have: number, want: number, what: string) => have >= want ? undefined : `${what} (${have} of ${want})`

/**
 * Work out how much Fieldwork may volunteer.
 * @param state - the current state.
 * @param rules - stage thresholds.
 * @returns the stage with plain-language reasons.
 */
export function evaluate(state: TrustState, rules: StageRules): PaceView {
  const counts = Object.fromEntries(SIGNAL_KINDS.map(k => [k, 0])) as Record<SignalKind, number>
  for (const s of state.signals) counts[s.kind]++
  const record = trackRecord(state.estimates)
  const evidence = counts.history_viewed + counts.history_corrected + counts.risk_viewed + counts.source_opened
  const curiosity = counts.question_asked + counts.source_opened
  const outcomes = counts.outcome_recorded + record.checked
  const steps: [Stage, (string | undefined)[], string][] = [
    [2, [need(evidence, rules.evidenceForExplain, 'look at the field history, a risk check or a source')], 'The farmer has looked at their field history or the evidence.'],
    [3, [need(curiosity, rules.curiosityForTrial, 'ask "why?" or open a source'), need(counts.risk_viewed, rules.risksForTrial, 'ask what a change would cost')], 'The farmer has asked about the reasons behind the numbers and what a change would cost.'],
    [4, [need(counts.trial_saved, rules.trialsForPlan, 'save a trial'), need(outcomes, rules.outcomesForPlan, 'record how a trial or season turned out')], 'The farmer has run a trial and recorded how it turned out.'],
  ]
  let stage: Stage = 1
  const why: string[] = []
  let next: string | null = null
  for (const [to, gaps, met] of steps) {
    const open = gaps.filter((g): g is string => g !== undefined)
    if (open.length > 0) { next = `${STAGES[to].name} once the farmer chooses to ${open.join(' and ')}.`; break }
    stage = to; why.push(met)
  }
  if (stage === 1) why.push('Starting point: show what happened and answer questions.')
  const lastDecline = state.signals.map(s => s.kind).lastIndexOf('suggestion_declined')
  const since = lastDecline === -1 ? Infinity : state.signals.length - 1 - lastDecline
  if (since < rules.quietAfterDecline && stage > 2) { stage = 2; why.push('The farmer turned down a suggestion recently, so Fieldwork holds back new ones for a while.') }
  if (state.pace === 'quiet') { stage = 1; why.push('The farmer asked Fieldwork to only answer what they ask.'); next = 'Nothing changes until the farmer sets the pace back to auto.' }
  return { stage, stageName: STAGES[stage].name, volunteers: STAGES[stage].farmer, pace: state.pace, counts, trackRecord: record, why, next }
}

/**
 * Append a signal, dropping the oldest past {@link SIGNAL_LIMIT}.
 * @param state - the current state.
 * @param signal - the signal without its timestamp.
 * @param now - the time to stamp.
 * @returns the new state.
 */
export function note(state: TrustState, signal: Omit<Signal, 'at'>, now: Date): TrustState {
  return { ...state, signals: [...state.signals, { ...signal, at: now.toISOString() }].slice(-SIGNAL_LIMIT) }
}

/**
 * Save an estimate so it can be checked after the season. The same field and change on the same day reuses the earlier entry.
 * @param state - the current state.
 * @param estimate - the estimate without id, time or check.
 * @param now - the time to stamp.
 * @returns the new state and the estimate id.
 */
export function saveEstimate(state: TrustState, estimate: Omit<Estimate, 'id' | 'at' | 'checked'>, now: Date): { state: TrustState; id: string } {
  const day = now.toISOString().slice(0, 10)
  const same = state.estimates.find(e => !e.checked && e.at.startsWith(day) && e.field === estimate.field && e.change === estimate.change)
  if (same) {
    const updated = { ...same, ...estimate }
    return { state: { ...state, estimates: state.estimates.map(e => e.id === same.id ? updated : e) }, id: same.id }
  }
  const id = `est-${randomUUID().slice(0, 8)}`
  const checkedOnes = state.estimates.filter(e => e.checked)
  const open = [...state.estimates.filter(e => !e.checked), { ...estimate, id, at: now.toISOString() }].slice(-ESTIMATE_LIMIT)
  return { state: { ...state, estimates: [...checkedOnes, ...open] }, id }
}

/**
 * Compare a saved estimate with what happened.
 * @param state - the current state.
 * @param id - estimate id.
 * @param yearWas - whether the season was normal or dry.
 * @param actual - the result the farmer saw, in the estimate's unit.
 * @param detail - optional note in the farmer's words.
 * @param now - the time to stamp.
 * @returns the new state.
 * @throws TrustError for an unknown or already-checked estimate.
 */
export function checkEstimate(state: TrustState, id: string, yearWas: 'normal' | 'dry', actual: number, detail: string | undefined, now: Date): TrustState {
  const e = state.estimates.find(x => x.id === id)
  if (!e) throw new TrustError(`No saved estimate "${id}". trust_status lists them.`, 'TRUST_INPUT')
  if (e.checked) throw new TrustError(`Estimate "${id}" was already checked on ${e.checked.at.slice(0, 10)}.`, 'TRUST_INPUT')
  const r = e[yearWas]
  const checked = { at: now.toISOString(), yearWas, actual, hit: actual >= Math.min(r.low, r.high) && actual <= Math.max(r.low, r.high), ...(detail === undefined ? {} : { note: detail }) }
  return { ...state, estimates: state.estimates.map(x => x.id === id ? { ...x, checked } : x) }
}

/**
 * Forget what Fieldwork noted. `signals` keeps the estimates and track record; `all` deletes both.
 * @param state - the current state.
 * @param what - what to delete.
 * @returns the new state; the pace setting stays.
 */
export function forget(state: TrustState, what: 'signals' | 'all'): TrustState {
  return { ...state, signals: [], estimates: what === 'all' ? [] : state.estimates }
}

/**
 * Model-facing guideline for the current stage.
 * @param v - output of {@link evaluate}.
 * @returns the system prompt section text.
 */
export function promptSection(v: PaceView): string {
  return [
    '# Trust guideline',
    'Most farmers do not trust AI yet. Be useful first, and let trust follow from being right about things they can check. Do not mention this guideline, stages or counts unless the farmer asks why you said or suggested something; then call trust_status.',
    '- Answer what the farmer asks, fully. Never refuse, delay or water down a request because of this guideline.',
    '- Give every number its unit, where it came from, and how sure it is. Say plainly when a number is an example or there is no reading.',
    `- Volunteer at most one thing per reply, and only what the current stage allows. Stage ${v.stage} of 4, "${v.stageName}": ${STAGES[v.stage].agent}`,
    '- If the farmer turns a suggestion down or ignores it, call trust_note with suggestion_declined and do not raise it again. If they take it up, call trust_note with suggestion_accepted. When they ask "why?" or "how do you know?", call trust_note with question_asked.',
    '- When a decision costs money, offer agronomist_packet so someone they already trust can check the numbers.',
    `- When the farmer plans a trial or wants to track a change, offer save_estimate for its risk_check. When they report how it turned out, offer check_estimate and report the result honestly, misses included. Track record on this farm: ${v.trackRecord.text}`,
    '- If the farmer wants less, call trust_set_pace with quiet. What Fieldwork notes stays on this computer and is never shared with buyers, lenders or insurers; trust_forget deletes it.',
  ].join('\n')
}

/** One record owner serializes changes and commits storage before publishing state. */
export class TrustRecords {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly file: string
  private state: TrustState
  /** Absolute directory for agronomist packets. */
  readonly packetDir: string

  private constructor(file: string, packetDir: string, state: TrustState) { this.file = file; this.packetDir = packetDir; this.state = state }

  /**
   * Open the trust file. A missing file starts empty; an invalid file fails without being reset.
   * @param file - absolute JSON file path.
   * @param packetDir - absolute directory for agronomist packets.
   * @returns the record owner.
   */
  static open(file: string, packetDir: string): TrustRecords {
    try { return new TrustRecords(file, packetDir, stateSchema.parse(JSON.parse(readFileSync(file, 'utf8')))) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new TrustRecords(file, packetDir, initialState())
      throw new TrustError('Could not open the trust file; the existing file has been preserved.', 'TRUST_STORAGE', error)
    }
  }

  /** @returns a detached copy of the state. */
  snapshot(): TrustState { return structuredClone(this.state) }

  /**
   * Persist a validated change.
   * @param transform - returns the next state from the current one.
   * @returns the committed state.
   */
  change(transform: (current: TrustState) => TrustState): Promise<TrustState> {
    const operation = this.queue.then(async () => {
      const next = stateSchema.parse(transform(this.snapshot()))
      try {
        await mkdir(dirname(this.file), { recursive: true })
        await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 })
        await rename(`${this.file}.tmp`, this.file)
      } catch (error) { throw new TrustError('Could not save the trust file; the previous state is unchanged.', 'TRUST_STORAGE', error) }
      this.state = next
      return this.snapshot()
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
}

declare module '@deepseek-ai/cordis' { interface Context { trustRecords: TrustRecords } }
/** Host trust-records plugin identity. */
export const name = 'fieldwork-trust-records'
/** Explicit destinations for the trust file and agronomist packets. */
export interface Config { file: string; packetDir: string }
/** Validate destinations at composition time. */
export const Config: schema<Config> = schema.object({ file: schema.string().required(), packetDir: schema.string().required() })
/** Provide the trust records through Cordis. */
export function apply(ctx: Context, config: Config): void { ctx.provide('trustRecords', TrustRecords.open(config.file, config.packetDir)) }
