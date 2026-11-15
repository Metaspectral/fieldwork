/** Client-safe persisted values for file-backed learning methods and field monitoring. */
import { z } from 'zod'
import type { Investigation } from './investigation-types.ts'
const text = z.string().trim().min(1).max(4000)
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-80).max(84)])
/** First monitor supports a single polygon ring, in longitude/latitude order. */
export const boundarySchema = z.object({ type: z.literal('Polygon'), coordinates: z.tuple([z.array(point).min(4).max(1000)]) }).superRefine((p, ctx) => {
  const ring = p.coordinates[0], first = ring[0]!, last = ring.at(-1)!
  if (first[0] !== last[0] || first[1] !== last[1]) ctx.addIssue({ code: 'custom', message: 'Close the polygon ring by repeating its first coordinate.' })
  const turn = (a: readonly number[], b: readonly number[], c: readonly number[]) => (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!)
  for (let i = 0; i < ring.length - 1; i++) for (let j = i + 2; j < ring.length - 1; j++) {
    if (i === 0 && j === ring.length - 2) continue
    const a = ring[i]!, b = ring[i + 1]!, c = ring[j]!, d = ring[j + 1]!
    const overlaps = Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) && Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
    if (overlaps && turn(a, b, c) * turn(a, b, d) <= 0 && turn(c, d, a) * turn(c, d, b) <= 0) { ctx.addIssue({ code: 'custom', message: 'Use a simple field polygon without crossing or touching non-adjacent edges.' }); return }
  }
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  if (Math.max(...xs) - Math.min(...xs) > .2 || Math.max(...ys) - Math.min(...ys) > .2) ctx.addIssue({ code: 'custom', message: 'Choose a field-sized polygon spanning at most 0.2 degrees in either direction.' })
  const area = Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
  if (area < 1e-10) ctx.addIssue({ code: 'custom', message: 'The polygon must enclose a nonzero area.' })
})
const featureSchema = z.object({ type: z.literal('Feature'), geometry: boundarySchema })
/** Accept a Polygon, one Feature, or a one-feature collection while retaining the original file separately. */
export function readFieldBoundary(value: unknown) {
  const parsed = z.union([boundarySchema, featureSchema, z.object({ type: z.literal('FeatureCollection'), features: z.tuple([featureSchema]) })]).parse(value)
  return parsed.type === 'Polygon' ? parsed : parsed.type === 'Feature' ? parsed.geometry : parsed.features[0].geometry
}
export type Boundary = z.infer<typeof boundarySchema>
export const methodIds = ['watch-field', 'scout-pattern', 'corn-strip-trial', 'historical-yield'] as const
export const methodRefSchema = z.object({ id: z.enum(methodIds), version: z.literal(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
export type MethodRef = z.infer<typeof methodRefSchema>
export const artifactSchema = z.object({ id: text, path: text, filename: text, mediaType: text, sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() })
export type Artifact = z.infer<typeof artifactSchema>
export const monitorInputSchema = z.object({ fieldId: text, boundary: boundarySchema, question: text, mode: z.enum(['live', 'demo']), boundarySourceId: text.optional(), minUsableFraction: z.number().min(.1).max(1), minValidPixels: z.number().int().min(4).max(100000), lookbackDays: z.number().int().min(7).max(90) })
export const monitorSchema = monitorInputSchema.extend({ id: text, method: methodRefSchema, methodArtifactId: text, boundaryArtifactId: text, active: z.boolean(), createdAt: z.iso.datetime(), nextCheckAt: z.iso.datetime(), everyDays: z.literal(7) })
export type Monitor = z.infer<typeof monitorSchema>
export const sceneSchema = z.object({
  id: text, key: text, acquiredAt: z.iso.datetime(), source: text, usableFraction: z.number().min(0).max(1), validPixels: z.number().int().nonnegative(), totalPixels: z.number().int().nonnegative(),
  meanNdvi: z.number().min(-1).max(1).nullable(), qualified: z.boolean(),
  grid: z.object({ width: z.number().int().positive().max(128), height: z.number().int().positive().max(128), values: z.array(z.number().min(-1).max(1).nullable()).max(16384) }).optional(),
  footprint: boundarySchema.optional(), artifactIds: z.array(text),
})
export type SceneObservation = z.infer<typeof sceneSchema>
export const checkSchema = z.object({ id: text, monitorId: text, method: methodRefSchema, mode: z.enum(['live', 'demo']), startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().optional(), from: z.iso.datetime(), to: z.iso.datetime(), status: z.enum(['running', 'available', 'no-new-data', 'no-usable-data', 'provider-error', 'interrupted']), catalogCount: z.number().int().nonnegative(), catalogLimited: z.boolean(), scenes: z.array(sceneSchema), error: z.object({ code: text, message: text }).optional(), artifactIds: z.array(text) })
export type MonitorCheck = z.infer<typeof checkSchema>
export const scoutInputSchema = z.object({ fieldId: text, checkId: text.optional(), question: text, notes: z.string().trim().min(1).max(100000) })
export const scoutSchema = scoutInputSchema.extend({ id: text, method: methodRefSchema, createdAt: z.iso.datetime(), artifactIds: z.array(text) })
export const trialInputSchema = z.object({ fieldId: text, investigationId: text.optional(), scoutId: text.optional(), previousTrialId: text.optional(), cornPlanId: text.optional(), sourceIds: z.array(text), question: text, baseline: text, alternative: text, constraints: text, measurements: text, design: z.enum(['exploratory', 'randomized-block']), replicates: z.number().int().min(1).max(12) }).superRefine((t, ctx) => {
  if (t.design === 'randomized-block' && t.replicates < 2) ctx.addIssue({ code: 'custom', message: 'A replicated design needs at least two blocks; review the appropriate number with your adviser.' })
})
export const resultRowSchema = z.object({ block: z.number().int().positive(), baselineYield: z.number().nonnegative().max(100000), alternativeYield: z.number().nonnegative().max(100000) })
export const trialSchema = z.object({
  id: text, fieldId: text, investigationId: text.optional(), scoutId: text.optional(), previousTrialId: text.optional(), cornPlanId: text.optional(), sourceIds: z.array(text), question: text, baseline: text, alternative: text, constraints: text, measurements: text, design: z.enum(['exploratory', 'randomized-block']), replicates: z.number().int().min(1).max(12),
  method: methodRefSchema, createdAt: z.iso.datetime(), status: z.enum(['draft', 'tracking', 'reviewed']),
  layout: z.array(z.object({ block: z.number().int().positive(), first: z.enum(['baseline', 'alternative']) })),
  results: z.object({ unit: z.enum(['kg/ha', 't/ha']), rows: z.array(resultRowSchema), baselineMean: z.number().nullable(), alternativeMean: z.number().nullable(), meanDifference: z.number().nullable(), complete: z.boolean(), interpretation: text, farmerDecision: text, recordedAt: z.iso.datetime() }).optional(), artifactIds: z.array(text),
})
export const learningStateSchema = z.object({ version: z.literal(2), monitors: z.array(monitorSchema), checks: z.array(checkSchema), scouts: z.array(scoutSchema), trials: z.array(trialSchema), artifacts: z.array(artifactSchema) })
export type LearningState = z.infer<typeof learningStateSchema>
export interface MethodCard { id: typeof methodIds[number]; version: 1; title: string; question: string; stage: 'observe' | 'investigate' | 'experiment'; effort: string; needs: string[]; produces: string[]; limits: string; sources: { title: string; url: string }[]; ref: MethodRef; instructions: string }
export interface LearningSnapshot extends LearningState { investigations: Investigation[]; methods: MethodCard[]; workspace: string; storageError?: string }
