/** Agent tool for NASA checks: read saved checks only; running a check is the farmer's action on the page. */
import type { Context } from '@deepseek-ai/cordis'
import { checked, defineTool, jsonOutput } from './native.ts'
import type {} from './rotation-signals.ts'
/** Plugin identity. */
export const name = 'fieldwork-rotation-signals-tools'
/** Native tools and the Host NASA checks service. */
export const inject = ['tools', 'nasaChecks']
/**
 * Register the read-only tool.
 * @param ctx - Plugin context.
 */
export function apply(ctx: Context): void {
  const checks = ctx.nasaChecks
  ctx.effect(() => ctx.tools.register(defineTool({ name: 'read_nasa_checks', description: 'Read saved NASA checks for a field: how often unusual seasons (dry, hot, wet spring) occurred here in 1981–2010 against recent years, and what they did to the field\'s greenness by crop. Read-only; odds from past seasons, not a forecast; never changes a rotation plan.', parameters: { fieldId: { type: 'string', description: 'Limit to one field.' } }, output: jsonOutput, async execute(a) { return checked(() => { const s = checks.status(); return { connected: s.connected, checks: a.fieldId ? s.checks.filter(c => c.fieldId === a.fieldId) : s.checks } }) } })))
}
