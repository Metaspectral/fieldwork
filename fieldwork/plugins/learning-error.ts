/** Typed errors for learning workspace storage and satellite checks. */
import { HarnessError } from '@deepseek-ai/dsh-error'
export class LearningError extends HarnessError {
  constructor(message: string, code: 'LEARNING_INPUT' | 'LEARNING_STORAGE' | 'MONITOR_PROVIDER' | 'MONITOR_DATA', cause?: unknown) {
    super(message, code, cause === undefined ? undefined : { cause }); this.name = 'LearningError'
  }
}
