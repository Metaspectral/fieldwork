/** Durable first-run state; the native Session remains the owner of the conversation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
const progressSchema = z.object({ version: z.literal(1), phase: z.enum(['new', 'agent-setup', 'in-progress', 'deferred', 'complete']), sessionId: z.string().optional(), started: z.boolean() })
import type { OnboardingState, OnboardingAction } from './onboarding-types.ts'
const prompt = 'Help me set up my farm.'
/** Narrow dependencies let the progress state machine be tested without a model. */
export interface OnboardingSessionOwner { create(): Promise<string>; begin(id: string): Promise<void>; cancel(id: string): void }
/** Serialize transitions so multiple tabs cannot create duplicate greetings or Sessions. */
export class FarmOnboarding {
  private active = true
  private queue: Promise<unknown> = Promise.resolve()
  private constructor(private readonly file: string, private state: OnboardingState, private readonly sessions: OnboardingSessionOwner) {}
  /** Missing progress starts fresh; corrupt progress must be repaired rather than discarded. */
  static open(file: string, sessions: OnboardingSessionOwner): FarmOnboarding {
    let state: OnboardingState = { version: 1, phase: 'new', started: false }
    try { state = progressSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    return new FarmOnboarding(file, state, sessions)
  }
  /** Return detached progress without activating an Agent. */
  snapshot(): OnboardingState { return structuredClone(this.state) }
  private async save(next: OnboardingState): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(`${this.file}.tmp`, JSON.stringify(progressSchema.parse(next), null, 2), { mode: 0o600 })
    await rename(`${this.file}.tmp`, this.file)
    this.state = next
  }
  /** Stop new work and await accepted progress transitions during plugin disposal. */
  async close(): Promise<void> { this.active = false; await this.queue }
  /** Complete one owner action; starting reserves the greeting before prompt admission. */
  perform(action: OnboardingAction): Promise<OnboardingState> {
    const operation = this.queue.then(async () => {
      if (!this.active) throw new Error('Farm setup is closing.')
      const next = this.snapshot()
      if (action === 'prepare' || action === 'resume') {
        if (action === 'prepare' && (next.phase === 'deferred' || next.phase === 'complete')) return next
        if (!next.sessionId) next.sessionId = await this.sessions.create()
        next.phase = next.started ? 'in-progress' : 'agent-setup'
        await this.save(next)
      } else if (action === 'begin') {
        if (next.phase !== 'agent-setup' || next.started || !next.sessionId) return next
        next.started = true; next.phase = 'in-progress'
        await this.save(next)
        try { await this.sessions.begin(next.sessionId) }
        catch (error) { await this.save({ ...next, started: false, phase: 'agent-setup' }); throw error }
      } else {
        if (next.sessionId) this.sessions.cancel(next.sessionId)
        next.phase = action === 'defer' ? 'deferred' : 'complete'
        await this.save(next)
      }
      return this.snapshot()
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
}
/** Built-in launch coordinator plugin identity. */
export const name = 'fieldwork-onboarding-progress'
/** Use the native Session lifecycle and preset registry. */
export const inject = ['sessionController', 'agentPresets', 'workspaceRegistry']
/** Dedicated progress file and onboarding working directory. */
export interface Config { file: string; workspace: string }
/** Validate runtime locations at composition time. */
export const Config: schema<Config> = schema.object({ file: schema.string().required(), workspace: schema.string().required() })
declare module '@deepseek-ai/cordis' { interface Context { farmOnboarding: FarmOnboarding } }
/** Register one runtime-owned progress service; provider setup stays with the native model picker. */
export function apply(ctx: Context, config: Config): void {
  const abort = new AbortController()
  const owner = FarmOnboarding.open(config.file, {
    async create() { await mkdir(config.workspace, { recursive: true }); const workspace = await ctx.workspaceRegistry.create(config.workspace, 'Farm workspace'); return (await ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: 'fieldwork' })).sessionId },
    async begin(id) { abort.signal.throwIfAborted(); await ctx.sessionController.prompt({ requestId: randomUUID() as SessionRequestId, sessionId: SessionId(id), mode: 'queue', content: [{ type: 'text', text: prompt }] }, abort.signal) },
    cancel(id) { ctx.sessionController.cancel({ sessionId: SessionId(id) }) },
  })
  ctx.provide('farmOnboarding', owner)
  ctx.effect(() => async () => { abort.abort(); await owner.close() })
}
