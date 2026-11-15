/** Farmer-owned POC records and deterministic plugin operations. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

const text = z.string().trim().min(1).max(2000)
const pluginId = z.enum(['farm', 'community', 'crop-plan', 'seed-cost', 'weather'])
const experiment = z.object({ id: text, title: text, baseline: text, change: text, source: text, status: z.enum(['draft', 'tracking']), observations: z.array(text) })
const post = z.object({ id: text, title: text, baseline: text, change: text, takeaway: text, author: text, source: text, sample: z.boolean() })
const stateSchema = z.object({
  version: z.literal(1),
  farm: z.object({ name: text, region: text, area: z.number().positive().max(100000), crop: text, approach: text, reason: text }),
  runs: z.array(z.object({ id: text, plugin: text, version: z.literal(1), inputs: z.record(z.string(), z.union([z.string(), z.number()])), result: z.record(z.string(), z.union([z.string(), z.number()])) })).default([]),
  active: z.array(pluginId), experiments: z.array(experiment), posts: z.array(post),
})
/** Durable workspace, separate from published summaries. */
export type State = z.infer<typeof stateSchema>
/** Installed POC capabilities. Sample runs do not activate capabilities. */
export const catalog = [
  { id: 'farm', name: 'My farm', role: 'Your starting point', description: 'Keep your fields, current approach, and the reasons behind it together.' },
  { id: 'community', name: 'Community', role: 'Learn from others', description: 'Explore attributed methods and share a selected summary. Local demo feed.' },
  { id: 'crop-plan', name: 'Crop planner', role: 'Compare a small change', description: 'Allocate a trial area while preserving the rest of your current crop plan.' },
  { id: 'seed-cost', name: 'Seed cost check', role: 'Check the arithmetic', description: 'Compare purchase costs at your own planting rate. No yield or profit claim.' },
  { id: 'weather', name: 'Weather window', role: 'Add another source', description: 'Explore a sample forecast alongside your own field observations. No live forecast.' },
] as const

function initialState(): State {
  return { version: 1, farm: { name: 'Alder Creek Farm', region: 'Fraser Valley · fictional demo', area: 12, crop: 'Spring barley', approach: 'Keep barley on the main area. Trial a cover crop on a small strip after harvest.', reason: 'The lower field stays wet longer. We wait until the soil is workable rather than following a fixed date.' }, runs: [], active: ['farm', 'community'], experiments: [], posts: [
    { id: 'demo-1', title: 'A smaller cover-crop trial taught us more', baseline: 'Our usual post-harvest fallow strip', change: 'A neighbouring strip with a locally reviewed cover-crop mix', takeaway: 'Establishment differed across the wet end of the field. One season was inconclusive; next time we will record soil conditions at sowing.', author: 'Maya · fictional grower', source: 'Fictional demo method v1', sample: true },
    { id: 'demo-2', title: 'Write down why you waited', baseline: 'Plant as soon as the calendar window opens', change: 'Record soil workability and the reason for each planting decision', takeaway: 'The notes made next season’s planning easier. This is farm knowledge, not a controlled yield comparison.', author: 'Jonah · fictional grower', source: 'Fictional demo knowledge v1', sample: true },
  ] }
}
const commands = z.discriminatedUnion('action', [
  z.object({ action: z.literal('farm'), farm: stateSchema.shape.farm }),
  z.object({ action: z.literal('activate'), plugin: pluginId, enabled: z.boolean() }),
  z.object({ action: z.literal('plan'), trialArea: z.number().positive(), crop: text }),
  z.object({ action: z.literal('seed'), area: z.number().positive().max(100000), rate: z.number().positive().max(10000), current: z.number().nonnegative().max(1000000), alternative: z.number().nonnegative().max(1000000) }),
  z.object({ action: z.literal('adapt'), postId: text }),
  z.object({ action: z.literal('draft'), title: text, baseline: text, change: text }),
  z.object({ action: z.literal('edit'), id: text, title: text, baseline: text, change: text }),
  z.object({ action: z.literal('track'), id: text }),
  z.object({ action: z.literal('observe'), id: text, observation: text }),
  z.object({ action: z.literal('publish'), id: text, title: text, takeaway: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('withdraw'), id: text }),
])
/** Command input is checked at the browser/model boundary. */
export type Command = z.infer<typeof commands>
/** A successful operation returns the saved snapshot and any calculation. */
export interface Result { state: State; result?: Record<string, string | number> }
/** Expected user input failures leave accepted records unchanged. */
export class InputError extends Error {}

/** Compare purchase costs; rates use bags per hectare and prices use CAD per bag. */
export function compareSeed(area: number, rate: number, current: number, alternative: number): Record<string, number | string> {
  const args = commands.parse({ action: 'seed', area, rate, current, alternative })
  if (args.action !== 'seed') throw new Error('Unexpected seed command')
  const round = (v: number) => Math.round(v * 100) / 100
  return { bags: round(area * rate), currentCost: round(area * rate * current), alternativeCost: round(area * rate * alternative), saving: round(area * rate * (current - alternative)), currency: 'CAD', scope: 'Seed purchase cost only; assumes the same bags/ha. Product suitability and yield are not compared.' }
}

/** One local workspace owner serializes mutations and saves before publishing state. */
export class FarmStore {
  private state: State
  private pending: Promise<unknown> = Promise.resolve()
  private constructor(private readonly path: string, state: State) { this.state = state }
  /** Load existing records; only a missing file creates the fictional demo. */
  static async open(path: string): Promise<FarmStore> {
    let state: State
    try { state = stateSchema.parse(JSON.parse(await readFile(path, 'utf8'))) }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      state = initialState()
    }
    return new FarmStore(path, state)
  }
  /** Return a detached private snapshot. */
  snapshot(): State { return structuredClone(this.state) }
  /** Validate, authorize the capability, and commit an explicit user action. */
  execute(input: unknown): Promise<Result> {
    const run = this.pending.then(() => this.commit(commands.parse(input)))
    this.pending = run.catch(() => undefined)
    return run
  }
  private async commit(command: Command): Promise<Result> {
    const state = this.snapshot()
    const requirePlugin = (id: z.infer<typeof pluginId>) => { if (!state.active.includes(id)) throw new InputError('Activate this plugin before using it.') }
    let result: Result['result']
    if (command.action === 'farm') { requirePlugin('farm'); state.farm = command.farm }
    else if (command.action === 'activate') { state.active = state.active.filter(id => id !== command.plugin); if (command.enabled) state.active.push(command.plugin) }
    else if (command.action === 'seed') { requirePlugin('seed-cost'); result = compareSeed(command.area, command.rate, command.current, command.alternative) }
    else if (command.action === 'plan') {
      requirePlugin('crop-plan')
      if (command.trialArea > state.farm.area) throw new InputError('The trial area cannot exceed your farm area.')
      result = { retainedArea: state.farm.area - command.trialArea, trialArea: command.trialArea, baseline: state.farm.crop, proposal: command.crop, scope: 'Area allocation only. Review crop suitability and rotation locally.' }
    } else if (command.action === 'adapt') {
      requirePlugin('community')
      const source = state.posts.find(p => p.id === command.postId)
      if (!source) throw new InputError('That community method is unavailable.')
      state.experiments.push({ id: randomUUID(), title: source.title, baseline: source.baseline, change: source.change, source: `${source.author} · ${source.id} · copied method v1`, status: 'draft', observations: [] })
    } else if (command.action === 'draft') {
      requirePlugin('crop-plan')
      state.experiments.push({ id: randomUUID(), title: command.title, baseline: command.baseline, change: command.change, source: 'Farmer-authored · method v1', status: 'draft', observations: [] })
    } else if (command.action === 'withdraw') {
      requirePlugin('community'); state.posts = state.posts.filter(p => p.sample || p.id !== command.id)
    } else {
      const trial = state.experiments.find(e => e.id === command.id)
      if (!trial) throw new InputError('That experiment is unavailable.')
      if (command.action === 'edit') {
        if (trial.status !== 'draft') throw new InputError('Accepted tracking methods stay fixed; create a new draft for a change.')
        trial.title = command.title; trial.baseline = command.baseline; trial.change = command.change
      }
      if (command.action === 'track') trial.status = 'tracking'
      if (command.action === 'observe') {
        if (trial.status !== 'tracking') throw new InputError('Start observation tracking before recording a note.')
        trial.observations.push(command.observation)
      }
      if (command.action === 'publish') {
        requirePlugin('community')
        state.posts.push({ id: randomUUID(), title: command.title, takeaway: command.takeaway, baseline: trial.baseline, change: trial.change, author: 'You · local demo', source: trial.source, sample: false })
      }
    }
    if (result && (command.action === 'plan' || command.action === 'seed')) {
      const { action, ...inputs } = command
      state.runs = [{ id: randomUUID(), plugin: action === 'plan' ? 'crop-plan' : 'seed-cost', version: 1 as const, inputs, result }, ...state.runs].slice(0, 20)
    }
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 })
    await rename(temporary, this.path)
    this.state = state
    return { state: this.snapshot(), ...(result === undefined ? {} : { result }) }
  }
}
