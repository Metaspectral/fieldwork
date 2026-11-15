/** Explicit native page actions share the same learning service as model tools. */
import { z } from 'zod'
import type { LearningWorkspace } from '../../plugins/learning.ts'
import { parseHarvestCsv } from '../../plugins/learning-calculations.ts'
import { LearningError } from '../../plugins/learning-error.ts'
/** Apply a reviewed page action; bounded checks use the existing monitor authorization. */
export async function performLearning(workspace: LearningWorkspace, input: unknown) {
  const c = z.object({ action: z.string(), payload: z.unknown(), confirmed: z.literal(true) }).parse(input)
  let createdId: string | undefined
  if (c.action === 'learning/demo') createdId = await workspace.createDemo()
  else if (c.action === 'learning/enable') createdId = await workspace.enableMonitor(c.payload)
  else if (c.action === 'learning/check') await workspace.checkNow(z.object({ id: z.string() }).parse(c.payload).id)
  else if (c.action === 'learning/active') { const p = z.object({ id: z.string(), active: z.boolean() }).parse(c.payload); await workspace.setMonitorActive(p.id, p.active) }
  else if (c.action === 'learning/scout') createdId = await workspace.saveScout(c.payload)
  else if (c.action === 'learning/trial') createdId = await workspace.draftTrial(c.payload)
  else if (c.action === 'learning/start') await workspace.startTrial(z.object({ id: z.string() }).parse(c.payload).id)
  else if (c.action === 'learning/outcome') {
    const p = z.object({ id: z.string(), unit: z.string(), csv: z.string(), interpretation: z.string(), farmerDecision: z.string() }).parse(c.payload)
    await workspace.recordOutcome({ ...p, rows: parseHarvestCsv(p.csv) })
  } else throw new LearningError('Unknown field learning action.', 'LEARNING_INPUT')
  return { ...(createdId ? { createdId } : {}), learning: workspace.snapshot() }
}
