/** Descriptive quality checks for imported yield points; no treatment effects or field-weighted yield. */
import type { z } from 'zod'
import { sourceSheets } from './source-table.ts'
import { yieldAnalysisInputSchema } from './investigation-types.ts'
import { LearningError } from './learning-error.ts'
export function inspectYieldPoints(sections: { locator: string; text: string }[], input: z.infer<typeof yieldAnalysisInputSchema>) {
  const sheet = sourceSheets(sections).find(s => s.name === input.sheet)
  if (!sheet?.rows.length) throw new LearningError('Select a readable worksheet.', 'LEARNING_INPUT')
  const header = sheet.rows[0]!, headers = sheet.cells.filter(c => c.row === header)
  const column = (name: string) => { const matches = headers.filter(c => String(c.value).trim() === name); if (matches.length !== 1) throw new LearningError('Choose three unambiguous column names from the first populated row.', 'LEARNING_INPUT'); return matches[0]!.column }
  const columns = [column(input.xColumn), column(input.yColumn), column(input.valueColumn)]
  if (new Set(columns).size !== 3) throw new LearningError('Choose different X, Y, and yield columns.', 'LEARNING_INPUT')
  const cells = new Map(sheet.cells.map(c => [`${c.row}:${c.column}`, c])), points: [number, number, number][] = [], locations = new Set<string>()
  let missingRows = 0, invalidRows = 0, duplicateLocations = 0, formulaCells = 0
  const rows = sheet.rows.filter(r => r > header)
  for (const row of rows) {
    const selected = columns.map(c => cells.get(`${row}:${c}`))
    formulaCells += selected.filter(c => c?.formula).length
    if (selected.some(c => c?.value === null || c?.value === undefined || typeof c.value === 'string' && !c.value.trim())) { missingRows++; continue }
    const values = selected.map(c => typeof c!.value === 'number' ? c!.value : typeof c!.value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(c!.value.trim()) ? Number(c!.value) : NaN)
    if (values.some(v => !Number.isFinite(v)) || values[2]! < 0) { invalidRows++; continue }
    const key = `${values[0]},${values[1]}`; if (locations.has(key)) duplicateLocations++; locations.add(key)
    points.push([values[0]!, values[1]!, values[2]!])
  }
  const sorted = points.map(p => p[2]).sort((a, b) => a - b), n = sorted.length
  return { totalRows: rows.length, validRows: n, missingRows, invalidRows, duplicateLocations, formulaCells, minimum: n ? sorted[0]! : null, maximum: n ? sorted[n - 1]! : null, median: n ? n % 2 ? sorted[Math.floor(n / 2)]! : (sorted[n / 2 - 1]! + (sorted[n / 2]! - sorted[n / 2 - 1]!) / 2) : null, pointMean: n ? sorted.reduce((mean, value, i) => mean + (value - mean) / (i + 1), 0) : null, points }
}
