/** Client-safe paired-yield input parsing; blank cells never become measured zeroes. */
import { z } from 'zod'
import { resultRowSchema } from './learning-types.ts'
/** Read the three-column numeric template, preserving explicit zero and rejecting missing values. */
export function parseHarvestCsv(text: string): z.infer<typeof resultRowSchema>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.shift()?.replace(/^\uFEFF/, '') !== 'block,baselineYield,alternativeYield') throw new z.ZodError([{ code: 'custom', path: ['csv'], message: 'Use the header block,baselineYield,alternativeYield and numeric rows from the harvest template.' }])
  if (lines.length > 12) throw new z.ZodError([{ code: 'custom', path: ['csv'], message: 'Enter up to twelve measured blocks; keep only the header when no yields were measured.' }])
  return lines.map((line, i) => {
    const cells = line.split(',').map(s => s.trim())
    if (cells.length !== 3 || cells.some(s => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))) throw new z.ZodError([{ code: 'custom', path: ['csv', i + 2], message: 'Each row needs three numeric values. Leave missing blocks out rather than filling them with zero.' }])
    return resultRowSchema.parse({ block: Number(cells[0]), baselineYield: Number(cells[1]), alternativeYield: Number(cells[2]) })
  })
}
