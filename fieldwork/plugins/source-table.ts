/** Read cached spreadsheet cells without calculating formulas or guessing column units. */
export interface TableCell { locator: string; row: number; column: number; value: unknown; display: string; formula?: string }
export interface SourceSheet { name: string; cells: TableCell[]; rows: number[]; columns: number[] }
export function sourceSheets(sections: { locator: string; text: string }[]): SourceSheet[] {
  const sheets = new Map<string, TableCell[]>()
  for (const section of sections) {
    const match = /^'((?:[^']|'')+)'!([A-Z]+)([1-9]\d*)$/.exec(section.locator)
    if (!match) continue
    let value: { value?: unknown; display?: unknown; formula?: unknown }
    try { value = JSON.parse(section.text) } catch { continue }
    if (!value || typeof value !== 'object') continue
    const name = match[1]!.replaceAll("''", "'"), column = [...match[2]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row = Number(match[3])
    const cell = { locator: section.locator, row, column, value: value.value, display: String(value.display ?? value.value ?? ''), ...(typeof value.formula === 'string' ? { formula: value.formula } : {}) }
    const cells = sheets.get(name) ?? []; cells.push(cell); sheets.set(name, cells)
  }
  return [...sheets].map(([name, cells]) => ({ name, cells, rows: [...new Set(cells.map(c => c.row))].sort((a, b) => a - b), columns: [...new Set(cells.map(c => c.column))].sort((a, b) => a - b) }))
}
export function columnName(column: number): string { let label = ''; while (column > 0) { column--; label = String.fromCharCode(65 + column % 26) + label; column = Math.floor(column / 26) }; return label }
