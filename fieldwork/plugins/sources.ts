/** Non-executing extraction: keep original bytes and cite cells, pages, or text blocks. */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { parse } from 'parse5'
import { sourceSchema, evidenceKind } from './domain.ts'
import { FarmError } from './records.ts'
export const sourceInputSchema = z.object({ title: z.string().trim().min(1).max(2000), origin: z.string().trim().min(1).max(2000), evidence: evidenceKind, scope: z.string().trim().min(1).max(2000), filename: z.string().max(200) })
export type SourceInput = z.infer<typeof sourceInputSchema>
/** Reject oversized or unreadable documents instead of silently truncating evidence. */
export async function extractSource(bytes: Uint8Array, input: SourceInput) {
  const meta = sourceInputSchema.parse(input)
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new FarmError('Choose a nonempty document up to 5 MiB.', 'FARM_INPUT')
  let extractedCharacters = 0
  const sections: { locator: string; text: string }[] = []
  const add = (locator: string, text: string) => {
    extractedCharacters += text.length
    if (extractedCharacters > 5 * 1024 * 1024) throw new FarmError('Extracted text exceeds 5 MiB; split the document.', 'FARM_INPUT')
    if (sections.length >= 10000 || text.length > 100000) throw new FarmError('Document exceeds the extraction limits; split it into smaller documents.', 'FARM_INPUT')
    sections.push({ locator, text })
  }
  const suffix = meta.filename.split('.').pop()?.toLowerCase()
  let kind: 'spreadsheet' | 'pdf' | 'website' | 'knowledge'
  if (['xlsx', 'xls', 'csv', 'ods'].includes(suffix ?? '')) {
    kind = 'spreadsheet'
    // SheetJS reads cached values and formula text; it does not calculate or execute macros.
    const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellText: true, bookVBA: false, sheetRows: 10001 })
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]!
      if (sheet['!fullref'] && sheet['!fullref'] !== sheet['!ref']) throw new FarmError('Spreadsheet has more than 10000 rows; select a smaller workbook.', 'FARM_INPUT')
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith('!')) continue
        add(`'${name.replaceAll("'", "''")}'!${address}`, JSON.stringify({ value: cell.v ?? null, display: cell.w ?? null, formula: cell.f ?? null, calculation: cell.f ? 'Cached value only; not recalculated or validated.' : 'Original cell value.' }))
      }
    }
  } else if (suffix === 'pdf') {
    kind = 'pdf'
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: new Uint8Array(bytes), enableXfa: false, disableFontFace: true, useSystemFonts: false, standardFontDataUrl: join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/' })
    try {
      const document = await task.promise
      if (document.numPages > 100) throw new FarmError('Choose a PDF up to 100 pages.', 'FARM_INPUT')
      for (let page = 1; page <= document.numPages; page++) {
        const content = await (await document.getPage(page)).getTextContent()
        add(`page ${page}`, content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''))
      }
    } finally { await task.destroy() }
  } else if (suffix === 'html' || suffix === 'htm') {
    kind = 'website'
    const tree = parse(Buffer.from(bytes).toString('utf8'))
    function visit(node: { nodeName: string; value?: string; childNodes?: unknown[] }): string {
      if (['script', 'style', 'noscript', 'template', 'svg'].includes(node.nodeName)) return ''
      if (node.nodeName === '#text') return node.value ?? ''
      return (node.childNodes ?? []).map(n => visit(n as typeof node)).join(' ') + (['p', 'h1', 'h2', 'h3', 'li', 'tr', 'article'].includes(node.nodeName) ? '\n' : '')
    }
    visit(tree).split(/\n/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach((text, i) => add(`block ${i + 1}`, text))
  } else if (['txt', 'md'].includes(suffix ?? '')) {
    kind = 'knowledge'
    Buffer.from(bytes).toString('utf8').split(/\n\s*\n/).filter(t => t.trim()).forEach((text, i) => add(`block ${i + 1}`, text.trim()))
  } else throw new FarmError('Supported originals: XLSX, XLS, CSV, ODS, PDF, HTML, TXT, and Markdown.', 'FARM_INPUT')
  if (!sections.some(s => s.text.trim())) throw new FarmError('No readable text or cells found. Scanned PDFs need OCR before import.', 'FARM_INPUT')
  return sourceSchema.parse({ id: randomUUID(), ...meta, kind, sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: new Date().toISOString(), sections })
}
