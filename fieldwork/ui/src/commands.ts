/** Browser user commands; model changes continue through separately approved native tools. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { farmSchema, draftTrial, seedComparison, FarmError, type FarmRecords } from '../../plugins/records.ts'
import { acceptCorn, observeCorn, proposeCorn, saveField } from '../../plugins/planning.ts'
import { captureUrl } from '../../plugins/capture.ts'
import { loadCornDemo } from '../../plugins/corn-demo.ts'
import { sourceInputSchema } from '../../plugins/sources.ts'
const text = z.string().trim().min(1).max(2000)
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('farm'), farm: farmSchema, confirmed: z.literal(true) }),
  z.object({ action: z.literal('adapt'), postId: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('plan'), title: text, change: text, trialAreaHa: z.number().positive(), confirmed: z.literal(true) }),
  z.object({ action: z.literal('edit'), id: text, title: text, baseline: text, change: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('track'), id: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('observe'), id: text, observation: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('preview'), id: text, title: text, takeaway: text }),
  z.object({ action: z.literal('publish'), previewId: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('withdraw'), id: text, confirmed: z.literal(true) }),
  z.object({ action: z.literal('seed'), areaHa: z.number(), bagsPerHa: z.number(), currentCadPerBag: z.number(), alternativeCadPerBag: z.number() }),
  z.object({ action: z.literal('save-seed'), areaHa: z.number(), bagsPerHa: z.number(), currentCadPerBag: z.number(), alternativeCadPerBag: z.number(), confirmed: z.literal(true) }),
])
/** Apply an explicitly submitted UI command and return only its result plus the committed snapshot. */
export async function perform(records: FarmRecords, input: unknown) {
  const request = z.object({ action: z.string() }).parse(input)
  if (['field', 'import-source', 'propose-corn', 'accept-corn', 'observe-corn', 'corn-demo', 'capture-source'].includes(request.action)) {
    const c = z.object({ action: z.string(), confirmed: z.literal(true), payload: z.unknown() }).parse(input)
    let createdId: string | undefined
    if (c.action === 'corn-demo') createdId = (await loadCornDemo(records)).id
    else if (c.action === 'field') createdId = await saveField(records, c.payload)
    else if (c.action === 'capture-source') {
      const value = sourceInputSchema.omit({ filename: true }).parse(c.payload)
      const captured = await captureUrl(value.origin)
      createdId = (await records.importSource(captured.bytes, { ...value, origin: captured.origin, filename: captured.filename })).id
    }
    else if (c.action === 'propose-corn') createdId = (await proposeCorn(records, c.payload)).id
    else if (c.action === 'accept-corn') await acceptCorn(records, z.object({ id: text }).parse(c.payload).id)
    else if (c.action === 'observe-corn') await observeCorn(records, c.payload)
    else {
      const value = sourceInputSchema.extend({ base64: z.string().max(7 * 1024 * 1024) }).parse(c.payload)
      createdId = (await records.importSource(Buffer.from(value.base64, 'base64'), value)).id
    }
    return { state: records.snapshot(), ...(createdId ? { createdId } : {}) }
  }
  const c = command.parse(input)
  if (c.action === 'preview') return { state: records.snapshot(), preview: records.preview(c.id, c.title, c.takeaway) }
  if (c.action === 'seed') return { state: records.snapshot(), comparison: seedComparison(c.areaHa, c.bagsPerHa, c.currentCadPerBag, c.alternativeCadPerBag) }
  let createdId: string | undefined
  const state = await records.change(s => {
    if (c.action === 'farm') s.farm = c.farm
    else if (c.action === 'save-seed') s.comparisons = [...s.comparisons, seedComparison(c.areaHa, c.bagsPerHa, c.currentCadPerBag, c.alternativeCadPerBag)].slice(-20)
    else if (c.action === 'adapt') {
      const p = s.summaries.find(p => p.id === c.postId)
      if (!p) throw new FarmError('Method not found.', 'FARM_INPUT')
      const t = draftTrial(p.title, p.baseline, p.change, `${p.author}: ${p.id}; ${p.source}`)
      s.trials.push(t); createdId = t.id
    } else if (c.action === 'plan') {
      z.number().positive().max(s.farm.areaHa).parse(c.trialAreaHa)
      const t = draftTrial(c.title, `${s.farm.crop}: ${s.farm.approach} Reason: ${s.farm.reason}`, `${c.change} Trial ${c.trialAreaHa} ha; retain ${s.farm.areaHa - c.trialAreaHa} ha of the current approach.`, 'Farmer-authored method v1')
      s.trials.push(t); createdId = t.id
    } else if (c.action === 'publish') s.summaries.push({ id: randomUUID(), ...records.reviewed(c.previewId) })
    else if (c.action === 'withdraw') {
      const p = s.summaries.find(p => p.id === c.id)
      if (!p || p.sample) throw new FarmError('Choose your own shared summary.', 'FARM_INPUT')
      s.summaries = s.summaries.filter(p => p.id !== c.id)
    } else {
      const t = s.trials.find(t => t.id === c.id)
      if (!t) throw new FarmError('Experiment not found.', 'FARM_INPUT')
      if (c.action === 'edit') {
        if (t.status !== 'draft') throw new FarmError('Tracked methods stay fixed; create a new draft.', 'FARM_INPUT')
        t.title = c.title; t.baseline = c.baseline; t.change = c.change
      } else if (c.action === 'track') t.status = 'tracking'
      else if (c.action === 'observe') {
        if (t.status !== 'tracking') throw new FarmError('Start tracking before recording an observation.', 'FARM_INPUT')
        t.observations.push(c.observation)
      }
    }
  })
  return { state, ...(createdId === undefined ? {} : { createdId }) }
}
