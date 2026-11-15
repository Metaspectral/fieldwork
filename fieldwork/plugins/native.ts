/** Native Harness tool registration and explicit mutation approval. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, ToolArgsError, type PreToolDecision } from '@deepseek-ai/dsh-tools'
import { ZodError } from 'zod'
/** Shared result renderer keeps structured data in ordinary native tool cards. */
export const jsonOutput = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }
/** Normalize parser failures without turning failed mutations into success results. */
export async function checked<T>(operation: () => Promise<T> | T): Promise<string> {
  try { return JSON.stringify(await operation()) }
  catch (error) { if (error instanceof ZodError) throw new ToolArgsError(error.issues.map(i => `${i.path.join('.')}: ${i.message}`)); throw error }
}
/** Require the native approval pipeline for every named mutation, even for direct tool-executor callers. */
export function approve(ctx: Context, names: readonly string[], detail?: (args: unknown) => string): void {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const decision = await next()
    if (decision.kind !== 'allow' || !names.includes(exec.name)) return decision
    return { kind: 'ask', reason: `Approve ${exec.name}: ${detail ? detail(exec.arguments) : JSON.stringify(exec.arguments)}` }
  })
}
export { defineTool }
