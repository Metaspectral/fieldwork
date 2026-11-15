/** Client-safe first-run protocol; provider credentials and farm content never live here. */
export interface OnboardingState { version: 1; phase: 'new' | 'agent-setup' | 'in-progress' | 'deferred' | 'complete'; sessionId?: string | undefined; started: boolean }
/** Owner UI transitions supported by the built-in coordinator. */
export type OnboardingAction = 'prepare' | 'begin' | 'defer' | 'complete' | 'resume'
