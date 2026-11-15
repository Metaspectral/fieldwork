/** Open investigations retain unknowns, selected evidence, and practical work before a treatment is chosen. */
import { z } from 'zod'
import { methodRefSchema } from './learning-types.ts'
const text = z.string().trim().min(1).max(4000)
export const evidenceLinkSchema = z.object({ sourceId: text, season: z.number().int().min(1900).max(2200).optional(), crop: text.optional(), role: z.enum(['yield', 'management', 'map', 'other']) })
export const investigationTaskSchema = z.object({ id: text, title: text, done: z.boolean(), assignee: z.string().trim().max(200).optional(), dueDate: z.iso.date().optional() })
export const investigationInputSchema = z.object({ id: text.optional(), expectedRevision: z.number().int().positive().optional(), fieldId: text, season: z.number().int().min(1900).max(2200).optional(), question: text, baseline: z.string().trim().max(4000).optional(), notes: z.string().trim().max(100000), evidence: z.array(evidenceLinkSchema).max(30), tasks: z.array(investigationTaskSchema).max(50) })
export const yieldAnalysisInputSchema = z.object({ investigationId: text, sourceId: text, sheet: text, xColumn: text, yColumn: text, valueColumn: text, unit: z.enum(['bu/ac', 'kg/ha', 't/ha', 'unknown']), coordinateSystem: text })
export const yieldAnalysisSchema = yieldAnalysisInputSchema.extend({ id: text, createdAt: z.iso.datetime(), sourceHash: text, season: z.number().int().optional(), crop: text.optional(), totalRows: z.number().int(), validRows: z.number().int(), missingRows: z.number().int(), invalidRows: z.number().int(), duplicateLocations: z.number().int(), formulaCells: z.number().int(), minimum: z.number().nullable(), maximum: z.number().nullable(), median: z.number().nullable(), pointMean: z.number().nullable(), points: z.array(z.tuple([z.number(), z.number(), z.number()])).max(10000), artifactIds: z.array(text) })
export const investigationSchema = investigationInputSchema.omit({ id: true, expectedRevision: true }).extend({ id: text, revision: z.number().int().positive(), method: methodRefSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), analyses: z.array(yieldAnalysisSchema), artifactIds: z.array(text), snapshots: z.array(z.object({ revision: z.number().int().positive(), artifactId: text })) })
export type Investigation = z.infer<typeof investigationSchema>
export type YieldAnalysis = z.infer<typeof yieldAnalysisSchema>
