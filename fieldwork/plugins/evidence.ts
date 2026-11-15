/**
 * Shared evidence format for every Fieldwork number shown to a farmer, the
 * "no source, no number" check, and the agronomist review packet.
 * See EVIDENCE.md for the team-facing description.
 */
import { z } from 'zod'

const figureSchema = z.object({
  /** Plain-language label, e.g. "Dry-year change vs. today". */
  label: z.string(),
  value: z.number(),
  /** Unit text, e.g. "USD/acre", "bu/acre", "%". */
  unit: z.string(),
  low: z.number().optional(),
  high: z.number().optional(),
  /** How the number was produced, in one sentence an agronomist can check. */
  method: z.string().optional(),
  /** Ids into the result's `sources` list. */
  sources: z.array(z.string()).optional(),
  /** True when the number is made up for illustration; the farmer must be told. */
  example: z.boolean().optional(),
}).loose()
const sourceSchema = z.object({ id: z.string(), title: z.string(), url: z.string().optional(), year: z.number().optional() }).loose()
const resultSchema = z.object({ summary: z.string(), figures: z.array(figureSchema), sources: z.array(sourceSchema), limits: z.array(z.string()).optional() }).loose()

/** One number the farmer will see. */
export type Figure = z.infer<typeof figureSchema>
/** One citable source. */
export type Source = z.infer<typeof sourceSchema>
/** The value every evidence-producing tool returns, serialized as JSON. */
export type EvidenceResult = z.infer<typeof resultSchema>

/** One problem the check found. */
export interface EvidenceIssue {
  /** The figure label. */
  where: string
  problem: 'no source' | 'unknown source' | 'no range' | 'no method' | 'example number'
  detail: string
}

/**
 * Parse a tool value as an evidence result. Native Fieldwork tools return JSON strings.
 * @param value - a canonical tool value.
 * @returns the evidence result, or undefined when the value carries no `figures` array.
 */
export function asEvidence(value: unknown): EvidenceResult | undefined {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) }
    catch (error) { void error; return undefined } // Non-JSON text output carries no figures.
  }
  const result = resultSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

/**
 * Check one result against the "no source, no number" rule. Example figures are
 * allowed but always reported so the model labels them.
 * @param result - an evidence result.
 * @returns every problem found; empty when each figure has a method, a range and a known source.
 */
export function checkEvidence(result: EvidenceResult): EvidenceIssue[] {
  const ids = new Set(result.sources.map(s => s.id))
  const issues: EvidenceIssue[] = []
  for (const f of result.figures) {
    const where = f.label
    if (f.example === true) issues.push({ where, problem: 'example number', detail: 'Made up for illustration; say so when you show it.' })
    const cited = f.sources ?? []
    if (cited.length === 0) issues.push({ where, problem: 'no source', detail: 'No source backs this number.' })
    for (const id of cited) if (!ids.has(id)) issues.push({ where, problem: 'unknown source', detail: `Source "${id}" is not in the sources list.` })
    if (f.low === undefined || f.high === undefined) issues.push({ where, problem: 'no range', detail: 'No uncertainty range (low/high).' })
    if (!f.method?.trim()) issues.push({ where, problem: 'no method', detail: 'No method an agronomist could check.' })
  }
  return issues
}

/**
 * @param issues - output of {@link checkEvidence}.
 * @returns the issues that make a number unverified (everything except example labels).
 */
export function seriousIssues(issues: readonly EvidenceIssue[]): EvidenceIssue[] { return issues.filter(i => i.problem !== 'example number') }

/**
 * Render issues as a model-facing note appended to the tool result.
 * @param tool - the tool name.
 * @param issues - output of {@link checkEvidence}.
 * @returns the note text.
 */
export function renderIssues(tool: string, issues: readonly EvidenceIssue[]): string {
  const serious = seriousIssues(issues)
  const examples = [...new Set(issues.filter(i => i.problem === 'example number').map(i => i.where))]
  const lines = [`Evidence check for ${tool}:`]
  if (serious.length > 0) lines.push('These numbers are NOT verified. Do not present them as fact. Say what is missing, or leave them out:', ...serious.map(i => `- ${i.where}: ${i.detail}`))
  if (examples.length > 0) lines.push('These numbers are examples, not data. Label each one "example" when you show it:', ...examples.map(l => `- ${l}`))
  return lines.join('\n')
}

/** One evidence result seen in this agent session. */
export interface SeenResult {
  tool: string
  /** The field the tool was about, when its arguments named one. */
  field?: string
  value: EvidenceResult
  issues: EvidenceIssue[]
}

/** Keeps the most recent evidence results, oldest dropped first. */
export class ResultLog {
  private readonly items: SeenResult[] = []
  private readonly limit: number

  /** @param limit - how many results to keep. */
  constructor(limit: number) { this.limit = limit }

  /**
   * Add one result.
   * @param tool - the tool name.
   * @param args - the tool arguments; a string `field` is captured.
   * @param value - the evidence result.
   */
  add(tool: string, args: unknown, value: EvidenceResult): void {
    const field = z.object({ field: z.string() }).safeParse(args)
    this.items.push({ tool, ...(field.success ? { field: field.data.field } : {}), value, issues: checkEvidence(value) })
    if (this.items.length > this.limit) this.items.shift()
  }

  /**
   * @param fields - field names the farmer chose to share; empty selects all.
   * @returns matching results, oldest first, compared case-insensitively.
   */
  select(fields: readonly string[]): SeenResult[] {
    if (fields.length === 0) return [...this.items]
    const wanted = new Set(fields.map(f => f.toLowerCase()))
    return this.items.filter(i => i.field !== undefined && wanted.has(i.field.toLowerCase()))
  }
}

const fmt = (n: number | undefined) => n === undefined ? '?' : n.toLocaleString('en-US')

/**
 * Render an agronomist review packet as Markdown.
 * @param results - the results to include.
 * @param generatedAt - the time to print.
 * @param trackRecord - one sentence on how Fieldwork's past estimates for this farm held up.
 * @returns the packet text.
 */
export function renderPacket(results: readonly SeenResult[], generatedAt: Date, trackRecord: string): string {
  const lines = ['# Agronomist review packet', '', `Generated ${generatedAt.toISOString().slice(0, 10)} at the farmer's request. It contains only the results listed below.`, 'Numbers marked EXAMPLE are made up for illustration and are not data.', `Fieldwork's track record on this farm: ${trackRecord}`, '']
  results.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.tool}${r.field ? `: ${r.field}` : ''}`, '', r.value.summary, '', '| Figure | Value | Range | Method | Sources |', '|---|---|---|---|---|')
    for (const f of r.value.figures) lines.push(`| ${f.label}${f.example ? ' (EXAMPLE)' : ''} | ${fmt(f.value)} ${f.unit} | ${fmt(f.low)} to ${fmt(f.high)} | ${f.method ?? 'missing'} | ${(f.sources ?? []).join(', ') || 'missing'} |`)
    const serious = seriousIssues(r.issues)
    lines.push('', `Evidence check: ${serious.length === 0 ? 'every figure has a method, a range and a known source.' : serious.map(i => `${i.where}: ${i.detail}`).join(' ')}`)
    if (r.value.limits?.length) lines.push('', 'Known limits:', ...r.value.limits.map(l => `- ${l}`))
    lines.push('', 'Sources:', ...r.value.sources.map(s => `- [${s.id}] ${s.title}${s.year ? ` (${s.year})` : ''}${s.url ? ` ${s.url}` : ''}`), '')
  })
  lines.push('## Review', '', '- [ ] Methods are reasonable for this farm', '- [ ] Ranges are honest', '- [ ] Sources support the numbers', '', 'Reviewed by: ________________  Date: ________', '')
  return lines.join('\n')
}
