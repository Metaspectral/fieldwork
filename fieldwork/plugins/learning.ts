/** File-backed learning records, deterministic monitoring, and owned weekly supervision. */
import { randomUUID, createHash, randomInt } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import type { FarmRecords } from './records.ts'
import { LearningError } from './learning-error.ts'
import { loadMethods } from './methods.ts'
import { DemoSatelliteProvider, EarthSearchProvider, type SatelliteProvider } from './satellite.ts'
import { learningStateSchema, readFieldBoundary, boundarySchema, monitorInputSchema, scoutInputSchema, trialInputSchema, resultRowSchema, type Artifact, type LearningState, type LearningSnapshot, type MethodCard, type MonitorCheck, type Monitor } from './learning-types.ts'
const WEEK = 7 * 24 * 60 * 60 * 1000
export interface LearningOptions { root: string; pollSeconds: number; checkTimeoutSeconds: number; scenesPerCheck: number }
/** One runtime owns one workspace; tests can inject the provider and clock without global changes. */
export class LearningWorkspace {
  private readonly listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly inFlight = new Map<string, { abort: AbortController; done: Promise<MonitorCheck> }>()
  private stopped = false
  private closing = false
  private storageError: LearningError | undefined
  private readonly operations = new Set<Promise<unknown>>()
  private polling: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private constructor(readonly options: LearningOptions, private state: LearningState, private methods: MethodCard[], private readonly farm: FarmRecords, private readonly live: SatelliteProvider, private readonly now: () => Date) {}
  static async open(options: LearningOptions, farm: FarmRecords, live: SatelliteProvider = new EarthSearchProvider(), now = () => new Date()) {
    let state: LearningState
    try { state = learningStateSchema.parse(JSON.parse(await readFile(join(options.root, 'index.json'), 'utf8'))) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') state = learningStateSchema.parse({ version: 1, monitors: [], checks: [], scouts: [], trials: [], artifacts: [] }); else throw new LearningError('Could not open the learning workspace; existing files were preserved.', 'LEARNING_STORAGE', error) }
    const methods = await loadMethods(options.root)
    const workspace = new LearningWorkspace(options, state, methods, farm, live, now)
    if (state.checks.some(c => c.status === 'running')) await workspace.change(s => { for (const c of s.checks) if (c.status === 'running') { c.status = 'interrupted'; c.finishedAt = now().toISOString(); c.error = { code: 'RUNTIME_RESTARTED', message: 'The runtime stopped before this check completed. A new check can retry.' }; const m = s.monitors.find(m => m.id === c.monitorId); if (m?.active) m.nextCheckAt = now().toISOString() } })
    return workspace
  }
  snapshot(): LearningSnapshot { return structuredClone({ ...this.state, methods: this.methods, workspace: this.options.root, ...(this.storageError ? { storageError: this.storageError.message } : {}) }) }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private change(transform: (state: LearningState) => void): Promise<void> {
    if (this.storageError) return Promise.reject(this.storageError)
    if (this.stopped) return Promise.reject(new LearningError('The learning workspace is stopping.', 'LEARNING_STORAGE'))
    const operation = this.queue.then(async () => {
      const state = structuredClone(this.state); transform(state); const next = learningStateSchema.parse(state)
      try { await mkdir(this.options.root, { recursive: true }); await writeFile(join(this.options.root, 'index.json.tmp'), JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(join(this.options.root, 'index.json.tmp'), join(this.options.root, 'index.json')) }
      catch (error) { this.storageError = new LearningError('Learning storage could not be committed. Monitoring is stopped; inspect the workspace and restart before retrying.', 'LEARNING_STORAGE', error); for (const listener of this.listeners) listener(); throw this.storageError }
      this.state = next; for (const listener of this.listeners) listener()
    })
    this.queue = operation.catch(() => undefined); return operation
  }
  private admit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing || this.stopped) return Promise.reject(new LearningError('The learning workspace is stopping.', 'LEARNING_STORAGE'))
    if (this.storageError) return Promise.reject(this.storageError)
    const work = operation(); this.operations.add(work)
    void work.then(() => this.operations.delete(work), () => this.operations.delete(work))
    return work
  }
  refreshMethods(): Promise<MethodCard[]> { return this.admit(() => this.refreshMethodsInternal()) }
  private async refreshMethodsInternal(): Promise<MethodCard[]> {
    try { this.methods = await loadMethods(this.options.root); return structuredClone(this.methods) }
    catch (error) { throw new LearningError('Could not read method.json or SKILL.md. Inspect the edited method files; existing observations and active monitor settings are preserved.', 'LEARNING_STORAGE', error) }
  }
  private method(id: MethodCard['id']): MethodCard { return this.methods.find(m => m.id === id)! }
  private requireField(id: string) {
    const field = this.farm.snapshot().fields.find(f => f.id === id)
    if (!field) throw new LearningError('Select an existing field before starting this method.', 'LEARNING_INPUT')
    return field
  }
  private async artifact(filename: string, mediaType: string, content: string): Promise<Artifact> {
    const bytes = Buffer.from(content), sha256 = createHash('sha256').update(bytes).digest('hex')
    const path = join('artifacts', sha256, filename)
    try {
      await mkdir(join(this.options.root, 'artifacts', sha256), { recursive: true })
      try { await writeFile(join(this.options.root, path), bytes, { mode: 0o600, flag: 'wx' }) }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; if (createHash('sha256').update(await readFile(join(this.options.root, path))).digest('hex') !== sha256) throw new Error('Existing artifact integrity mismatch') }
    } catch (error) { throw new LearningError('Could not retain the learning file. No record was accepted.', 'LEARNING_STORAGE', error) }
    return { id: randomUUID(), path, filename, mediaType, sha256, bytes: bytes.length }
  }
  readArtifact(id: string): Promise<{ artifact: Artifact; bytes: Buffer }> { return this.admit(() => this.readArtifactInternal(id)) }
  private async readArtifactInternal(id: string): Promise<{ artifact: Artifact; bytes: Buffer }> {
    const artifact = this.state.artifacts.find(a => a.id === id)
    if (!artifact || relative(this.options.root, join(this.options.root, artifact.path)).startsWith('..')) throw new LearningError('Learning file not found.', 'LEARNING_INPUT')
    try { const bytes = await readFile(join(this.options.root, artifact.path)); if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error('File hash changed'); return { artifact: structuredClone(artifact), bytes } }
    catch (error) { throw new LearningError('This saved file changed or cannot be read; inspect the workspace original before relying on its recorded result.', 'LEARNING_STORAGE', error) }
  }
  private pin(method: MethodCard) { return this.artifact('method-package.json', 'application/json', JSON.stringify(method, null, 2)) }
  enableMonitor(input: unknown): Promise<string> { return this.admit(() => this.enableMonitorInternal(input)) }
  private async enableMonitorInternal(input: unknown): Promise<string> {
    const request = monitorInputSchema.omit({ boundary: true }).extend({ boundary: boundarySchema.optional() }).parse(input)
    let boundaryText: string
    if (request.boundarySourceId) {
      const original = await this.farm.original(request.boundarySourceId)
      boundaryText = original.toString('utf8')
    } else boundaryText = JSON.stringify(request.boundary)
    let boundary: Monitor['boundary']
    try { boundary = readFieldBoundary(JSON.parse(boundaryText)) }
    catch (error) { throw new LearningError('Choose a GeoJSON Polygon, Feature, or one-feature collection for this field.', 'LEARNING_INPUT', error) }
    if (request.boundary && request.boundarySourceId && JSON.stringify(request.boundary) !== JSON.stringify(boundary)) throw new LearningError('The pasted boundary differs from the selected original file. Choose one matching boundary.', 'LEARNING_INPUT')
    const value = monitorInputSchema.parse({ ...request, boundary }), field = this.requireField(value.fieldId)
    if (field.evidence === 'demo' && value.mode !== 'demo') throw new LearningError('Use simulated monitoring for a fictional field, or add your real field first.', 'LEARNING_INPUT')
    await this.refreshMethodsInternal(); const method = this.method('watch-field'), id = randomUUID(), artifact = await this.pin(method), boundaryArtifact = await this.artifact('boundary-original.geojson', 'application/geo+json', boundaryText)
    await this.change(s => {
      if (s.monitors.some(m => m.fieldId === value.fieldId && m.active)) throw new LearningError('This field already has an active monitor; pause it before enabling another.', 'LEARNING_INPUT')
      s.artifacts.push(artifact, boundaryArtifact); s.monitors.push({ ...value, id, method: method.ref, methodArtifactId: artifact.id, boundaryArtifactId: boundaryArtifact.id, active: true, createdAt: this.now().toISOString(), nextCheckAt: this.now().toISOString(), everyDays: 7 })
    })
    return id
  }
  setMonitorActive(id: string, active: boolean): Promise<void> { return this.admit(() => this.setMonitorActiveInternal(id, active)) }
  private async setMonitorActiveInternal(id: string, active: boolean): Promise<void> {
    await this.change(s => { const m = s.monitors.find(m => m.id === id); if (!m) throw new LearningError('Monitor not found.', 'LEARNING_INPUT'); if (active && s.monitors.some(other => other.id !== id && other.fieldId === m.fieldId && other.active)) throw new LearningError('Another monitor is already active for this field.', 'LEARNING_INPUT'); m.active = active; if (active) m.nextCheckAt = this.now().toISOString() })
    if (!active) { const run = this.inFlight.get(id); run?.abort.abort(new Error('Monitor paused')); await run?.done }
  }
  /** Check now is admitted once per monitor; concurrent callers share the same check. */
  checkNow(id: string): Promise<MonitorCheck> {
    if (this.storageError) return Promise.reject(this.storageError)
    const existing = this.inFlight.get(id); if (existing) return existing.done
    if (this.stopped || this.closing) return Promise.reject(new LearningError('The monitor runtime is stopping.', 'LEARNING_STORAGE'))
    const m = this.state.monitors.find(m => m.id === id)
    if (!m) return Promise.reject(new LearningError('Monitor not found.', 'LEARNING_INPUT'))
    const abort = new AbortController()
    const done = this.runCheck(structuredClone(m), abort.signal).finally(() => { this.inFlight.delete(id) })
    this.inFlight.set(id, { abort, done }); return done
  }
  private async runCheck(monitor: Monitor, signal: AbortSignal): Promise<MonitorCheck> {
    const end = this.now(), id = randomUUID(), to = end.toISOString(), from = new Date(end.getTime() - monitor.lookbackDays * 86400000).toISOString()
    const check: MonitorCheck = { id, monitorId: monitor.id, method: monitor.method, mode: monitor.mode, startedAt: to, from, to, status: 'running', catalogCount: 0, catalogLimited: false, scenes: [], artifactIds: [monitor.methodArtifactId, monitor.boundaryArtifactId] }
    await this.change(s => { s.checks.push(check) })
    const provider = monitor.mode === 'demo' ? new DemoSatelliteProvider() : this.live
    const deadline = AbortSignal.timeout(this.options.checkTimeoutSeconds * 1000), combined = AbortSignal.any([signal, deadline]), artifacts: Artifact[] = []
    try {
      const found = await provider.search(monitor, from, to, combined)
      combined.throwIfAborted()
      check.catalogCount = found.scenes.length; check.catalogLimited = found.limited
      const known = new Set(this.state.checks.filter(c => c.monitorId === monitor.id).flatMap(c => c.scenes.map(o => o.key)))
      const fresh = found.scenes.filter(scene => !known.has(scene.key))
      if (fresh.length > this.options.scenesPerCheck) check.catalogLimited = true
      for (const scene of fresh.slice(0, this.options.scenesPerCheck)) {
        const product = await provider.process(monitor, scene, combined)
        combined.throwIfAborted()
        const files: Artifact[] = []
        for (const file of product.files) { combined.throwIfAborted(); files.push(await this.artifact(file.filename, file.mediaType, file.content)) }
        combined.throwIfAborted()
        artifacts.push(...files); check.scenes.push({ ...product.observation, artifactIds: files.map(f => f.id) })
      }
      check.status = check.scenes.some(s => s.qualified) ? 'available' : check.scenes.length ? 'no-usable-data' : 'no-new-data'
    } catch (error) {
      if (error instanceof LearningError && error.code === 'LEARNING_STORAGE') throw error
      check.status = signal.aborted ? 'interrupted' : 'provider-error'
      check.error = { code: signal.aborted ? 'CHECK_CANCELLED' : deadline.aborted ? 'CHECK_TIMEOUT' : error instanceof LearningError ? error.code : 'MONITOR_PROVIDER', message: signal.aborted ? 'This check was interrupted; previously saved observations remain available.' : deadline.aborted ? 'The check timed out. A later check can retry.' : error instanceof LearningError ? error.message : 'The data check failed. No missing image was interpreted as a crop result.' }
    }
    check.finishedAt = this.now().toISOString(); check.artifactIds = [monitor.methodArtifactId, monitor.boundaryArtifactId, ...artifacts.map(a => a.id)]
    const receipt = await this.artifact('check.json', 'application/json', JSON.stringify(check, null, 2)); artifacts.push(receipt); check.artifactIds.push(receipt.id)
    await this.change(s => { s.artifacts.push(...artifacts); s.checks[s.checks.findIndex(c => c.id === id)] = check; const m = s.monitors.find(m => m.id === monitor.id)!; const anchor = Date.parse(m.nextCheckAt); if (anchor <= this.now().getTime()) m.nextCheckAt = new Date(anchor + (Math.floor((this.now().getTime() - anchor) / WEEK) + 1) * WEEK).toISOString() })
    return structuredClone(check)
  }
  /** Persist one visit as a file; an image observation and a field diagnosis remain distinct. */
  saveScout(input: unknown): Promise<string> { return this.admit(() => this.saveScoutInternal(input)) }
  private async saveScoutInternal(input: unknown): Promise<string> {
    const value = scoutInputSchema.parse(input); this.requireField(value.fieldId)
    if (value.checkId) { const c = this.state.checks.find(c => c.id === value.checkId); if (!c || this.state.monitors.find(m => m.id === c.monitorId)?.fieldId !== value.fieldId) throw new LearningError('Choose an observation from this field.', 'LEARNING_INPUT') }
    await this.refreshMethodsInternal(); const method = this.method('scout-pattern'), id = randomUUID()
    const files = [await this.pin(method), await this.artifact('scouting.md', 'text/markdown', `# ${value.question}\n\n${value.notes}\n`)]
    await this.change(s => { s.artifacts.push(...files); s.scouts.push({ ...value, id, method: method.ref, createdAt: this.now().toISOString(), artifactIds: files.map(f => f.id) }) })
    return id
  }
  draftTrial(input: unknown): Promise<string> { return this.admit(() => this.draftTrialInternal(input)) }
  private async draftTrialInternal(input: unknown): Promise<string> {
    const value = trialInputSchema.parse(input), field = this.requireField(value.fieldId), farm = this.farm.snapshot()
    if (value.previousTrialId && !this.state.trials.some(t => t.id === value.previousTrialId && t.fieldId === value.fieldId)) throw new LearningError('Choose a previous comparison from this field.', 'LEARNING_INPUT')
    if (value.scoutId && !this.state.scouts.some(s => s.id === value.scoutId && s.fieldId === value.fieldId)) throw new LearningError('Choose a scouting note from this field.', 'LEARNING_INPUT')
    if (value.cornPlanId && !farm.cornPlans.some(p => p.id === value.cornPlanId && p.fieldId === value.fieldId && p.status === 'accepted')) throw new LearningError('Choose an accepted corn plan for this field.', 'LEARNING_INPUT')
    if (value.sourceIds.some(id => !farm.sources.some(s => s.id === id))) throw new LearningError('A selected source file no longer exists.', 'LEARNING_INPUT')
    await this.refreshMethodsInternal(); const method = this.method('corn-strip-trial'), id = randomUUID()
    const layout = Array.from({ length: value.replicates }, (_, i) => ({ block: i + 1, first: value.design === 'randomized-block' && randomInt(2) ? 'alternative' as const : 'baseline' as const }))
    const createdAt = this.now().toISOString(), context = { ...value, field, farm: farm.farm, sources: farm.sources.filter(s => value.sourceIds.includes(s.id)).map(s => ({ id: s.id, sha256: s.sha256, origin: s.origin })), cornPlan: farm.cornPlans.find(p => p.id === value.cornPlanId), layout, method: method.ref, createdAt }
    const files = [await this.pin(method), await this.artifact('trial-protocol.json', 'application/json', JSON.stringify(context, null, 2)), await this.artifact('harvest-template.csv', 'text/csv', 'block,baselineYield,alternativeYield\n' + layout.map(b => `${b.block},,`).join('\n') + '\n')]
    await this.change(s => { s.artifacts.push(...files); s.trials.push({ ...value, id, layout, method: method.ref, status: 'draft', createdAt, artifactIds: files.map(f => f.id) }) })
    return id
  }
  startTrial(id: string): Promise<void> { return this.admit(() => this.startTrialInternal(id)) }
  private async startTrialInternal(id: string): Promise<void> {
    await this.change(s => { const trial = s.trials.find(t => t.id === id); if (!trial || trial.status !== 'draft') throw new LearningError('Select a draft to review before starting tracking.', 'LEARNING_INPUT'); trial.status = 'tracking' })
  }
  recordOutcome(input: unknown): Promise<void> { return this.admit(() => this.recordOutcomeInternal(input)) }
  private async recordOutcomeInternal(input: unknown): Promise<void> {
    const value = z.object({ id: z.string(), unit: z.enum(['kg/ha', 't/ha']), rows: z.array(resultRowSchema).max(12), interpretation: z.string().trim().min(1).max(4000), farmerDecision: z.string().trim().min(1).max(4000) }).parse(input)
    const trial = this.state.trials.find(t => t.id === value.id)
    if (!trial || trial.status !== 'tracking') throw new LearningError('Start tracking before saving a reviewed outcome; previous outcomes remain fixed.', 'LEARNING_INPUT')
    const blocks = new Set(value.rows.map(r => r.block))
    if (blocks.size !== value.rows.length || value.rows.some(r => r.block > trial.replicates)) throw new LearningError('Use each planned block at most once.', 'LEARNING_INPUT')
    const baselineMean = value.rows.length ? value.rows.reduce((s, r) => s + r.baselineYield, 0) / value.rows.length : null, alternativeMean = value.rows.length ? value.rows.reduce((s, r) => s + r.alternativeYield, 0) / value.rows.length : null
    const results = { ...value, baselineMean, alternativeMean, meanDifference: alternativeMean === null || baselineMean === null ? null : alternativeMean - baselineMean, complete: value.rows.length === trial.replicates, recordedAt: this.now().toISOString() }
    const files = [await this.artifact('harvest-results.csv', 'text/csv', 'block,baselineYield,alternativeYield\n' + value.rows.map(r => `${r.block},${r.baselineYield},${r.alternativeYield}`).join('\n') + '\n'), await this.artifact('learning.md', 'text/markdown', `# ${trial.question}\n\n## Observed comparison\n\nBaseline mean: ${baselineMean ?? 'unavailable'} ${value.unit}. Alternative mean: ${alternativeMean ?? 'unavailable'} ${value.unit}. Paired difference: ${results.meanDifference ?? 'unavailable'} ${value.unit}. ${value.rows.length}/${trial.replicates} planned blocks recorded. Descriptive summary only; no significance test or causal conclusion.\n\n## Interpretation and deviations\n\n${value.interpretation}\n\n## Farmer decision\n\n${value.farmerDecision}\n`), await this.artifact('summary.json', 'application/json', JSON.stringify({ method: trial.method, results }, null, 2))]
    await this.change(s => { const t = s.trials.find(t => t.id === value.id)!; if (t.status !== 'tracking') throw new LearningError('An outcome was already recorded; create a follow-up trial.', 'LEARNING_INPUT'); t.results = results; t.status = 'reviewed'; t.artifactIds.push(...files.map(f => f.id)); s.artifacts.push(...files) })
  }
  /** Provision a clearly fictional, local-only example after explicit owner approval. */
  createDemo(): Promise<string> { return this.admit(() => this.createDemoInternal()) }
  private async createDemoInternal(): Promise<string> {
    const fieldId = randomUUID()
    await this.farm.change(s => { s.fields.push({ id: fieldId, name: 'Corn learning field · fictional demo', areaHa: 4, evidence: 'demo', years: {}, notes: ['Invented wet corner and seeding question; no production result.'] }) })
    return this.enableMonitorInternal({ fieldId, boundary: { type: 'Polygon', coordinates: [[[-100.87, 37.98], [-100.8675, 37.98], [-100.8675, 37.98164], [-100.87, 37.98164], [-100.87, 37.98]]] }, question: 'Why does the lower corner establish unevenly, and what should we measure before changing our corn practice?', mode: 'demo', minUsableFraction: .6, minValidPixels: 16, lookbackDays: 30 })
  }
  /** A poll admits at most one due monitor; a restart catches up without replaying every missed week. */
  async tick(): Promise<void> {
    if (this.stopped || this.closing || this.storageError || this.inFlight.size) return
    const due = this.state.monitors.find(m => m.active && Date.parse(m.nextCheckAt) <= this.now().getTime())
    if (due) await this.checkNow(due.id)
  }
  start(report: (error: unknown) => void): void {
    const launch = () => { this.polling = poll() }
    const poll = async () => { try { await this.tick() } catch (error) { report(error) } finally { if (!this.stopped && !this.closing) this.timer = setTimeout(launch, this.options.pollSeconds * 1000) } }
    this.timer = setTimeout(launch, this.options.pollSeconds * 1000)
  }
  async dispose(): Promise<void> {
    this.closing = true
    if (this.timer) clearTimeout(this.timer)
    // Keep storage available until admitted checks have persisted their interrupted receipts.
    for (const run of this.inFlight.values()) run.abort.abort(new Error('Runtime stopping'))
    await Promise.allSettled([...this.inFlight.values()].map(r => r.done)); await Promise.allSettled([...this.operations]); await this.polling; await this.queue; this.stopped = true; this.listeners.clear()
  }
}
declare module '@deepseek-ai/cordis' { interface Context { farmLearning: LearningWorkspace } }
export const name = 'fieldwork-learning'
export const inject = ['farmRecords']
export interface Config extends LearningOptions {}
export const Config: schema<Config> = schema.object({ root: schema.string().required(), pollSeconds: schema.number().min(1).max(3600).default(30), checkTimeoutSeconds: schema.number().min(5).max(300).default(90), scenesPerCheck: schema.number().min(1).max(10).default(3) })
export async function apply(ctx: Context, config: Config): Promise<void> {
  const workspace = await LearningWorkspace.open(config, ctx.farmRecords)
  ctx.effect(() => { ctx.provide('farmLearning', workspace); workspace.start(error => ctx.logger.warn('Fieldwork monitor could not commit its check; inspect workspace storage before retrying.', error)); return () => workspace.dispose() })
}
