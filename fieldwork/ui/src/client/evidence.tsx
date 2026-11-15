/** Familiar source views retain exact cell/page citations without repeating storage identifiers. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FarmState } from '../../../plugins/records.ts'
import { sourceSheets, columnName, type TableCell } from '../../../plugins/source-table.ts'
import type { FieldworkKey } from './locales.ts'
import { FarmMarkdown } from './markdown.tsx'
import shared from './page.module.css'
import css from './investigation.module.css'
type Source = FarmState['sources'][number]
/** Render only inert text, cached cells, and authenticated PNG/JPEG originals. */
export function EvidenceView({ source, contextSeason, t }: { source: Source; contextSeason?: number | undefined; t(key: FieldworkKey): string }): ReactNode {
  const sheets = source.kind === 'spreadsheet' ? sourceSheets(source.sections) : []
  const [sheetIndex, setSheetIndex] = useState(0), [page, setPage] = useState(0), [search, setSearch] = useState(''), [selected, setSelected] = useState<TableCell | null>(null)
  const sheet = sheets[sheetIndex], cells = new Map(sheet?.cells.map(c => [`${c.row}:${c.column}`, c]) ?? [])
  const rows = sheet?.rows.filter(r => !search || sheet.columns.some(c => cells.get(`${r}:${c}`)?.display.toLowerCase().includes(search.toLowerCase()))) ?? []
  const sections = source.sections.filter(s => !search || s.text.toLowerCase().includes(search.toLowerCase())), section = sections[Math.min(page, sections.length - 1)]
  const count = sheet ? Math.ceil(rows.length / 40) : sections.length
  return <div className={css.evidence}>
    <div className={css.metadata}><span>{contextSeason ?? source.season ?? t('seasonUnknown')}</span><span>{source.evidence}</span>{source.originalFile && <a href={new URL(`fieldwork-original?id=${encodeURIComponent(source.id)}`, document.baseURI).href} download>{t('downloadOriginal')}</a>}</div>
    <p>{source.scope}</p>
    {source.mediaType ? <img className={css.sourceImage} src={new URL(`fieldwork-image?id=${encodeURIComponent(source.id)}`, document.baseURI).href} alt={source.title} /> : <>
      <div className={css.toolbar}>{sheets.length > 1 && <label>{t('worksheet')}<select value={sheetIndex} onChange={e => { setSheetIndex(Number(e.target.value)); setPage(0); setSelected(null) }}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>}<label className={shared.field}>{t('searchEvidence')}<input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label></div>
      {sheet ? <>
        <p className={css.muted}>{rows.length} {t('worksheetRows')} · {sheet.columns.length} {t('worksheetColumns')} · {t('selectCellHint')}</p>
        <div className={shared.tableScroll}><table className={css.sheetTable}><caption>{sheet.name}</caption><thead><tr><th scope="col">#</th>{sheet.columns.map(c => <th scope="col" key={c}>{columnName(c)}</th>)}</tr></thead><tbody>{rows.slice(page * 40, page * 40 + 40).map(r => <tr key={r}><th scope="row">{r}</th>{sheet.columns.map(c => { const cell = cells.get(`${r}:${c}`); return <td key={c}>{cell ? <button aria-pressed={selected?.locator === cell.locator} onClick={() => setSelected(cell)}>{cell.display || '—'}</button> : '—'}</td> })}</tr>)}</tbody></table></div>
        {selected && <aside className={css.citation}><strong>{selected.locator}</strong><p>{selected.display || '—'}</p>{selected.formula && <p><code>={selected.formula}</code> · {t('cachedFormula')}</p>}<label className={shared.field}>{t('citationLocator')}<input readOnly value={`${source.id} / ${selected.locator}`} onFocus={e => e.currentTarget.select()} /></label></aside>}
      </> : section ? <article className={css.documentPage}><h3>{section.locator}</h3>{source.kind === 'pdf' ? <p className={shared.preserveLines}>{section.text}</p> : <FarmMarkdown text={section.text} t={t} />}</article> : <p>{t('noMatchingEvidence')}</p>}
      {count > 1 && <div className={css.pagination}><Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('previousPage')}</Button><span>{page + 1} / {count}</span><Button disabled={page + 1 >= count} onClick={() => setPage(p => p + 1)}>{t('nextPage')}</Button></div>}
    </>}
    <details className={css.sourceDetails}><summary>{t('sourceDetails')}</summary><p>{source.origin}</p><p>{t('capturedOn')}: {new Date(source.capturedAt).toLocaleDateString()}</p><code>SHA-256 {source.sha256}</code></details>
  </div>
}
