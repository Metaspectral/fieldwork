/** One native page data owner shared across the three panels. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LearningSnapshot } from '../../../plugins/learning-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
/** Owner data and command results returned by the authenticated Host. */
export interface Reply { state: FarmState; learning: LearningSnapshot; createdId?: string; comparison?: FarmState['comparisons'][number]; preview?: { previewId: string; summary: FarmState['summaries'][number] } }
/** Shared page load and mutation state. */
export interface PageState { data: FarmState | null; learning: LearningSnapshot | null; busy: boolean; error: string | null; saved: boolean }
/** Native injected callbacks and observable; the renderer supplies the hook. */
export interface Face { hooks: { records: ReturnType<typeof createSnapshotStore<PageState>> }; section: 'farm' | 'community' | 'experiments' | 'library' | 'corn' | 'learning'; refresh(): Promise<void>; perform(command: Record<string, unknown>): Promise<Reply> }
/** Own transport lifetime and publish only authoritative server snapshots. */
export class PageController {
  readonly store = createSnapshotStore<PageState>({ data: null, learning: null, busy: false, error: null, saved: false })
  private readonly abort = new AbortController()
  private readonly events: EventSource
  private sequence = 0
  constructor() {
    this.events = new EventSource(new URL('fieldwork-events', document.baseURI))
    this.events.onmessage = () => { void this.refresh() }
    this.events.onopen = () => { void this.refresh() }
    void this.refresh()
  }
  private async request(command?: Record<string, unknown>): Promise<Reply> {
    const result = await fetch(new URL('fieldwork-data', document.baseURI), command === undefined ? { signal: this.abort.signal } : { method: 'POST', signal: this.abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })
    const response = await result.json()
    if (!result.ok) throw new Error(response.error ?? 'Could not load farm records.')
    return response as Reply
  }
  async refresh(): Promise<void> {
    const sequence = ++this.sequence
    try { const response = await this.request(); if (sequence === this.sequence) this.store.update(s => { s.data = response.state; s.learning = response.learning; s.error = null }) }
    catch (error) { if (!this.abort.signal.aborted && sequence === this.sequence) this.store.update(s => { s.error = error instanceof Error ? error.message : 'Could not load farm records.' }) }
  }
  async perform(command: Record<string, unknown>): Promise<Reply> {
    this.store.update(s => { s.busy = true; s.error = null; s.saved = false })
    try { const response = await this.request(command); ++this.sequence; this.store.update(s => { s.data = response.state; s.learning = response.learning; s.saved = command.confirmed === true }); await this.refresh(); return response }
    catch (error) { this.store.update(s => { s.error = error instanceof Error ? error.message : 'Could not save this change.' }); throw error }
    finally { this.store.update(s => { s.busy = false }) }
  }
  dispose(): void { this.abort.abort(); this.events.close() }
}
