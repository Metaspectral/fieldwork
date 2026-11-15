/** Readable method packages; private manifests and instructions never supply executable code. */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { methodIds, type MethodCard } from './learning-types.ts'
const text = z.string().trim().min(1).max(4000)
const manifestSchema = z.object({ id: z.enum(methodIds), version: z.literal(1), title: text, question: text, stage: z.enum(['observe', 'investigate', 'experiment']), effort: text, needs: z.array(text).min(1), produces: z.array(text).min(1), limits: text, sources: z.array(z.object({ title: text, url: z.url().refine(url => url.startsWith('https://'), 'Method reference links must use HTTPS.') })) })
/** Install absent package files and read private edits without executing instructions or scripts. */
export async function loadMethods(root: string): Promise<MethodCard[]> {
  return Promise.all(methodIds.map(async id => {
    const folder = join(root, 'methods', id, 'v1'); await mkdir(folder, { recursive: true })
    for (const filename of ['method.json', 'SKILL.md']) {
      const original = await readFile(new URL(`../methods/${id}/${filename}`, import.meta.url), 'utf8')
      try { await writeFile(join(folder, filename), original, { flag: 'wx', mode: 0o600 }) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
    }
    const definition = manifestSchema.parse(JSON.parse(await readFile(join(folder, 'method.json'), 'utf8')))
    if (definition.id !== id) throw new Error(`Method identity differs from its installed directory: ${id}`)
    const instructions = await readFile(join(folder, 'SKILL.md'), 'utf8')
    if (Buffer.byteLength(instructions) > 100000) throw new Error(`Method instructions exceed 100000 bytes: ${id}`)
    const sha256 = createHash('sha256').update(JSON.stringify(definition) + instructions).digest('hex')
    return { ...definition, instructions, ref: { id, version: 1, sha256 } }
  }))
}
