/** Private farm records owned by the local Harness Host, without a separate web interface. */
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, rename, writeFile, readFile } from 'node:fs/promises'
import { copyFileSync, constants, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-error'

import { fieldSchema, sourceSchema, cornPlanSchema } from './domain.ts'
import { rotationPlanSchema } from './rotation-domain.ts'

const text = z.string().trim().min(1).max(2000)
/** Farmer-confirmed current practice and reasoning, with explicit area units. */
export const farmSchema = z.object({ name: text, region: text, areaHa: z.number().positive().max(100000), crop: text, approach: text, reason: text })
const trialSchema = z.object({ id: text, title: text, baseline: text, change: text, source: text, status: z.enum(['draft', 'tracking']), observations: z.array(text) })
const summarySchema = z.object({ id: text, title: text, baseline: text, change: text, takeaway: text, source: text, author: text, sample: z.boolean() })
const legacySchema = z.object({ version: z.literal(1), farm: farmSchema, trials: z.array(trialSchema), summaries: z.array(summarySchema), comparisons: z.array(z.object({ id: text, pluginVersion: z.literal(1), areaHa: z.number(), bagsPerHa: z.number(), currentCadPerBag: z.number(), alternativeCadPerBag: z.number(), currentCad: z.number(), alternativeCad: z.number(), savingCad: z.number() })) })
const secondSchema = legacySchema.extend({ version: z.literal(2), fields: z.array(fieldSchema), sources: z.array(sourceSchema), cornPlans: z.array(cornPlanSchema) })
const stateSchema = secondSchema.extend({ version: z.literal(3), rotationPlans: z.array(rotationPlanSchema) })
/** Private durable record format; community summaries are separate objects. */
export type FarmState = z.infer<typeof stateSchema>
/** Exact selected content reviewed before publication. */
export type ShareSummary = Omit<z.infer<typeof summarySchema>, 'id'>
/** Domain failures are routable through the native tool-result pipeline. */
export class FarmError extends HarnessError {
  /** Retain a stable domain code and optional failure cause. */
  constructor(message: string, code: 'FARM_INPUT' | 'FARM_STORAGE', cause?: unknown) { super(message, code, cause === undefined ? undefined : { cause }); this.name = 'FarmError' }
}
function demo(): FarmState {
  return { version: 3, fields: [], sources: [], cornPlans: [], rotationPlans: [], farm: { name: 'Alder Creek · fictional demo', region: 'Fraser Valley', areaHa: 12, crop: 'Spring barley', approach: 'Keep barley on the main area and try changes on a small strip.', reason: 'The lower field stays wet longer; soil workability matters more than a fixed planting date.' }, trials: [], comparisons: [], summaries: [
    { id: 'sample-cover-crop', title: 'Start with a small cover-crop strip', baseline: 'Our usual post-harvest fallow strip', change: 'A locally reviewed cover-crop mix on one neighbouring strip', takeaway: 'One season was inconclusive. Next time record soil conditions and establishment.', source: 'Fictional demonstration method v1', author: 'Maya · fictional grower', sample: true },
    { id: 'sample-field-notes', title: 'Record why you waited to plant', baseline: 'Plant within the usual calendar window', change: 'Record soil workability and the reason for waiting', takeaway: 'Farmer knowledge helps interpret next season. This is not a controlled yield comparison.', source: 'Fictional demonstration knowledge v1', author: 'Jonah · fictional grower', sample: true },
  ] }
}
/** One record owner serializes changes and commits storage before publishing snapshots. */
export class FarmRecords {
  private readonly listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly previews = new Map<string, ShareSummary>()
  private constructor(private readonly file: string, private state: FarmState) {}
  /** Open this plugin's own versioned file; never import the abandoned mockup format. */
  static open(file: string): FarmRecords {
    let original: string
    try { original = readFileSync(file, 'utf8') }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return new FarmRecords(file, demo())
      throw new FarmError('Could not read farm records; the existing file has been preserved.', 'FARM_STORAGE', error)
    }
    try {
      const raw = JSON.parse(original)
      if (raw?.version === 1 || raw?.version === 2) {
        const generation = raw.version as 1 | 2
        const earlier = generation === 1 ? { ...legacySchema.parse(raw), fields: [], sources: [], cornPlans: [] } : secondSchema.parse(raw)
        try { copyFileSync(file, `${file}.v${generation}.backup`, constants.COPYFILE_EXCL) }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          if (readFileSync(`${file}.v${generation}.backup`, 'utf8') !== original) throw new Error(`A different v${generation} migration backup already exists; preserve both files before migrating.`)
        }
        return new FarmRecords(file, stateSchema.parse({ ...earlier, version: 3, rotationPlans: [] }))
      }
      return new FarmRecords(file, stateSchema.parse(raw))
    } catch (error) { throw new FarmError('Could not open farm records; the existing file has been preserved.', 'FARM_STORAGE', error) }
  }
  /** Folder that holds the records file and its side files, such as retained originals and the farm picture. */
  get directory(): string { return dirname(this.file) }
  /** Subscribe to successful commits; disposal removes the listener. */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  /** Return detached private records; callers choose which fields to disclose. */
  snapshot(): FarmState { return structuredClone(this.state) }
  /** Persist a validated domain mutation. Tool callers must pass native approval first. */
  change(transform: (draft: FarmState) => void): Promise<FarmState> {
    const operation = this.queue.then(async () => {
      const draft = this.snapshot()
      transform(draft)
      const next = stateSchema.parse(draft)
      try {
        await mkdir(dirname(this.file), { recursive: true })
        await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 })
        await rename(`${this.file}.tmp`, this.file)
      } catch (error) { throw new FarmError('Could not save farm records; accepted records are unchanged.', 'FARM_STORAGE', error) }
      this.state = next
      for (const listener of this.listeners) listener()
      return this.snapshot()
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
  /** Retain immutable original bytes before publishing their catalog entry. */
  async importSource(bytes: Uint8Array, input: import('./sources.ts').SourceInput) {
    const { extractSource } = await import('./sources.ts')
    if (input.fieldId && !this.state.fields.some(f => f.id === input.fieldId)) throw new FarmError('Select an existing field for this source.', 'FARM_INPUT')
    let source: z.infer<typeof sourceSchema>
    try { source = await extractSource(bytes, input) }
    catch (error) { if (error instanceof FarmError || error instanceof z.ZodError) throw error; throw new FarmError('Could not read this original document; check the format or import a readable copy.', 'FARM_INPUT', error) }
    const file = join(dirname(this.file), 'originals', source.sha256)
    try {
      await mkdir(dirname(file), { recursive: true })
      try { await writeFile(file, bytes, { mode: 0o600, flag: 'wx' }) }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; if (createHash('sha256').update(await readFile(file)).digest('hex') !== source.sha256) throw new Error('An existing original has different bytes.') }
    } catch (error) { throw new FarmError('Could not retain the original document; nothing was cataloged.', 'FARM_STORAGE', error) }
    source.originalFile = source.sha256
    await this.change(s => { s.sources.push(source) })
    return structuredClone(source)
  }
  /** Serve an owner-selected original as a download, never inline executable HTML. */
  async original(sourceId: string): Promise<Buffer> {
    const source = this.state.sources.find(s => s.id === sourceId)
    if (!source?.originalFile) throw new FarmError('Original document not found.', 'FARM_INPUT')
    const bytes = await readFile(join(dirname(this.file), 'originals', source.sha256))
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new FarmError('Original document integrity check failed.', 'FARM_STORAGE')
    return bytes
  }
  /** Prepare selected text only; raw observations and the farm-record object are never attached. */
  preview(id: string, title: string, takeaway: string): { previewId: string; summary: ShareSummary } {
    const trial = this.state.trials.find(t => t.id === id)
    if (!trial) throw new FarmError('Experiment not found.', 'FARM_INPUT')
    const summary: ShareSummary = { title: text.parse(title), takeaway: text.parse(takeaway), baseline: trial.baseline, change: trial.change, source: trial.source, author: 'You · local demonstration', sample: false }
    const previewId = createHash('sha256').update(JSON.stringify(summary)).digest('hex')
    if (this.previews.size >= 20) this.previews.clear()
    this.previews.set(previewId, summary)
    return { previewId, summary: structuredClone(summary) }
  }
  /** Resolve immutable reviewed content; unknown previews cannot publish. */
  reviewed(previewId: string): ShareSummary {
    const summary = this.previews.get(previewId)
    if (!summary) throw new FarmError('Preview the selected summary again before sharing.', 'FARM_INPUT')
    return structuredClone(summary)
  }
}
/** Create an attributable private draft. */
export function draftTrial(title: string, baseline: string, change: string, source: string): FarmState['trials'][number] {
  return trialSchema.parse({ id: randomUUID(), title, baseline, change, source, status: 'draft', observations: [] })
}
/** Calculate comparable seed purchase costs in CAD; does not compare product suitability or yield. */
export function seedComparison(areaHa: number, bagsPerHa: number, currentCadPerBag: number, alternativeCadPerBag: number): FarmState['comparisons'][number] {
  const positive = z.number().positive().max(100000)
  positive.parse(areaHa); positive.parse(bagsPerHa)
  z.number().nonnegative().max(1000000).parse(currentCadPerBag); z.number().nonnegative().max(1000000).parse(alternativeCadPerBag)
  const money = (price: number) => Math.round(areaHa * bagsPerHa * price * 100) / 100
  return { id: randomUUID(), pluginVersion: 1, areaHa, bagsPerHa, currentCadPerBag, alternativeCadPerBag, currentCad: money(currentCadPerBag), alternativeCad: money(alternativeCadPerBag), savingCad: Math.round((money(currentCadPerBag) - money(alternativeCadPerBag)) * 100) / 100 }
}

declare module '@deepseek-ai/cordis' { interface Context { farmRecords: FarmRecords } }
/** Host records plugin identity. */
export const name = 'fieldwork-records'
/** Explicit destination for private records. */
export interface Config { file: string }
/** Validate the destination at composition time. */
export const Config: schema<Config> = schema.object({ file: schema.string().required() })
/** Provide shared records through Cordis; no HTTP routes or HTML are registered. */
export function apply(ctx: Context, config: Config): void { ctx.provide('farmRecords', FarmRecords.open(config.file)) }
