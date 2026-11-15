/** Client launch orchestration; durable progress and greeting admission remain Host-owned. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { OnboardingState, OnboardingAction } from '../../../plugins/onboarding-types.ts'
/** Native model directory fields required to gate first-run admission. */
interface ModelState { current: unknown; routable: boolean | null }
/** Viewing state for setup cards. */
export interface SetupView { progress: OnboardingState | null; busy: boolean; error: string | null; modelReady: boolean }
/** Native navigation provided by the plugin's apply world. */
export interface SetupNavigation { open(id: string): Promise<void>; farm(): void; failed(): void }
/** Own browser transport, one model subscription, and one launch attempt. */
export class OnboardingController {
  readonly store = createSnapshotStore<SetupView>({ progress: null, busy: false, error: null, modelReady: false })
  private readonly abort = new AbortController()
  private source: ObservableSnapshot<ModelState> | undefined
  private stopModel: () => void = () => {}
  private blocked = false
  constructor(private readonly navigation: SetupNavigation) {}
  private async request(action?: OnboardingAction): Promise<OnboardingState> {
    const response = await fetch(new URL('fieldwork-onboarding', document.baseURI), { signal: this.abort.signal, ...(action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) } : {}) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? 'Could not load farm setup.')
    return body as OnboardingState
  }
  /** Auto-open only unfinished setup; deferred and completed users keep normal navigation. */
  async boot(): Promise<void> {
    try {
      const progress = await this.request()
      this.store.update(s => { s.progress = progress })
      if (progress.phase !== 'deferred' && progress.phase !== 'complete') await this.open('prepare')
    } catch (error) { this.fail(error); if (!this.abort.signal.aborted) this.navigation.failed() }
  }
  private fail(error: unknown): void { if (!this.abort.signal.aborted) this.store.update(s => { s.error = error instanceof Error ? error.message : 'Could not open farm setup.' }) }
  /** Observe the native picker rather than creating a second model or credential setup. */
  attachModel(id: string, source: ObservableSnapshot<ModelState>): void {
    if (id !== this.store.getSnapshot().progress?.sessionId) return
    const sync = () => {
      const m = source.getSnapshot(); const ready = m.current !== null && m.routable === true
      this.store.update(s => { s.modelReady = ready })
      if (ready && !this.blocked && this.store.getSnapshot().progress?.phase === 'agent-setup' && !this.store.getSnapshot().busy) void this.begin()
    }
    if (source === this.source) { sync(); return }
    this.stopModel(); this.source = source
    this.stopModel = source.subscribe(sync); sync()
  }
  private async act(action: OnboardingAction): Promise<OnboardingState> {
    this.store.update(s => { s.busy = true; s.error = null })
    try { const progress = await this.request(action); this.store.update(s => { s.progress = progress }); return progress }
    finally { if (!this.abort.signal.aborted) this.store.update(s => { s.busy = false }) }
  }
  /** Resume the existing native Session, preserving its questions and history. */
  async open(action: 'prepare' | 'resume' = 'resume'): Promise<void> {
    try { const p = await this.act(action); if (action === 'prepare' && (p.phase === 'deferred' || p.phase === 'complete')) return; if (!this.abort.signal.aborted && p.sessionId) await this.navigation.open(p.sessionId) }
    catch (error) { this.fail(error) }
  }
  /** The Host serializes this request across tabs and admits the greeting once. */
  async begin(): Promise<void> {
    if (!this.store.getSnapshot().modelReady || this.store.getSnapshot().busy) return
    this.blocked = false
    try { await this.act('begin') }
    catch (error) { this.blocked = true; this.fail(error) }
  }
  /** Pause or finish cancels the pending setup turn before leaving the conversation. */
  async leave(action: 'defer' | 'complete'): Promise<void> {
    try { await this.act(action); if (!this.abort.signal.aborted) this.navigation.farm() }
    catch (error) { this.fail(error) }
  }
  dispose(): void { this.abort.abort(); this.stopModel() }
}
/** Presentation face supplied to native slots. */
export interface SetupFace { hooks: { setup: OnboardingController['store'] }; id?: string | undefined; hero?: boolean | undefined; open(): Promise<void>; begin(): Promise<void>; leave(action: 'defer' | 'complete'): Promise<void> }
