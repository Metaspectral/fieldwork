/**
 * Evidence Guard: no source, no number.
 *
 * Checks every watched tool result against the shared evidence format
 * (EVIDENCE.md). In `warn` mode it appends a note naming unverified and example
 * numbers; in `block` mode an unverified result becomes an error the model must
 * correct. Example figures are labeled, never blocked. Also offers
 * `agronomist_packet`, an approved local Markdown file of every number's method,
 * range and sources for the farmer to hand to their agronomist.
 */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { asEvidence, checkEvidence, renderIssues, renderPacket, ResultLog, seriousIssues } from './evidence.ts'
import { trackRecord, TrustError } from './trust.ts'
import { approve, checked, defineTool, jsonOutput } from './native.ts'

/** Native evidence-guard plugin identity. */
export const name = 'fieldwork-evidence-guard'
/** Packets are written under the Host-owned trust records directory. */
export const inject = ['tools', 'trustRecords']

/** Evidence-guard configuration. */
export interface Config {
  /** Tools that must return the evidence format. */
  tools: string[]
  /** Also check any other tool whose value carries a `figures` array. */
  checkAnyFigures: boolean
  /** `warn` appends a note; `block` turns unverified results into errors. */
  mode: 'warn' | 'block'
  /** How many recent evidence results a packet can draw on. */
  packetLimit: number
}
/** Validate watched tools and mode at composition time. */
export const Config: schema<Config> = schema.object({
  tools: schema.array(schema.string()).default(['risk_check']),
  checkAnyFigures: schema.boolean().default(true),
  mode: schema.union([schema.const('warn' as const), schema.const('block' as const)]).default('warn'),
  packetLimit: schema.natural().min(1).default(50),
}) as schema<Config>

/** Register the result check, the result log, and the approved packet writer. */
export function apply(ctx: Context, config: Config): void {
  const watched = new Set(config.tools)
  const log = new ResultLog(config.packetLimit)

  ctx.on('tools/result', (exec, result) => {
    if (result.isError) return
    const evidence = asEvidence(result.value)
    if (evidence) log.add(exec.name, exec.arguments, evidence)
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept' || result.isError) return decision
    const evidence = asEvidence(result.value)
    if (!evidence) return watched.has(exec.name) ? { kind: 'accept', content: [...(decision.content ?? result.content), { type: 'text', text: `Evidence check for ${exec.name}: the result has no figures in the shared evidence format. Do not show numbers from it as verified.` }] } : decision
    if (!watched.has(exec.name) && !config.checkAnyFigures) return decision
    const issues = checkEvidence(evidence)
    if (issues.length === 0) return decision
    const note = renderIssues(exec.name, issues)
    if (config.mode === 'block' && seriousIssues(issues).length > 0) return { kind: 'block', feedback: [{ type: 'text', text: `${note}\nReturn each number with a method, a low/high range and a source id from the sources list.` }] }
    return { kind: 'accept', content: [...(decision.content ?? result.content), { type: 'text', text: note }] }
  })

  const fields = z.object({ fields: z.array(z.string()).optional() })
  approve(ctx, ['agronomist_packet'], input => {
    const chosen = fields.parse(input).fields ?? []
    const results = log.select(chosen)
    return `Save a review file for your agronomist on this device with ${results.length} result(s)${chosen.length ? ` for ${chosen.join(', ')}` : ' from this session'}. Nothing is sent; you decide who gets it.`
  })
  ctx.tools.register(defineTool({
    name: 'agronomist_packet',
    description: 'When the farmer asks, save a review file for their agronomist: every number shown this session with its method, range, sources, limits and evidence check. Pass fields to include only the fields the farmer wants to share. Requires approval; nothing is sent anywhere.',
    parameters: { fields: { type: 'array', items: { type: 'string' }, description: 'Field names to include; omit for all.' } },
    output: jsonOutput,
    async execute(a) {
      return checked(async () => {
        const results = log.select(a.fields ?? [])
        if (results.length === 0) throw new TrustError('No numbers have been shown for those fields yet. Run risk_check first.', 'TRUST_INPUT')
        const now = new Date()
        const dir = ctx.trustRecords.packetDir
        const path = join(dir, `agronomist-packet-${now.toISOString().replace(/[:.]/g, '-')}.md`)
        try {
          await mkdir(dir, { recursive: true })
          await writeFile(path, renderPacket(results, now, trackRecord(ctx.trustRecords.snapshot().estimates).text), { mode: 0o600 })
        } catch (error) { throw new TrustError('Could not save the agronomist packet.', 'TRUST_STORAGE', error) }
        return { path, results: results.length, sharedWith: 'nobody yet; saved on this device' }
      })
    },
  }))
}
