/** Shared field records: the My farm fields table and the field context list on Corn planning. */
import type { ReactNode } from 'react'
import type { FarmState } from '../../../plugins/records.ts'
import { shortYearNote } from '../../../plugins/rotation-domain.ts'
import type { FieldworkKey } from './locales.ts'
import { cropLabel, fieldAcres } from './rotation.tsx'
import css from './page.module.css'
import own from './my-farm.module.css'
type Field = FarmState['fields'][number]
type T = (key: FieldworkKey) => string
/** Most recent years shown as columns; older years stay on the Rotation page. */
const yearColumns = 8
/** Crops of one family share a pill colour, so a rotation's pattern can be read across a row. */
const cropTone = (crop: string) => crop === 'corn' ? 'corn' : crop === 'soybean' || crop === 'field-pea' ? 'legume' : crop === 'spring-wheat' || crop === 'winter-wheat' || crop === 'oats' || crop === 'barley' ? 'grain' : 'other'
/**
 * A crop name as a small coloured pill, the same on the fields table and the field conditions tables.
 * @param props - Crop id and the dictionary lookup.
 * @returns The pill.
 */
export function CropPill({ crop, t }: { crop: string; t: T }): ReactNode {
  return <span className={own.crop} data-tone={cropTone(crop)}>{cropLabel(t, crop)}</span>
}
/**
 * Field context list used on Corn planning.
 * @param props - Field records, the dictionary lookup and an optional header action.
 * @returns A card listing each field with its evidence, notes and recorded years.
 */
export function FieldContext({ fields, t, action }: { fields: FarmState['fields']; t: T; action?: ReactNode }): ReactNode {
  return <section className={css.card}>
    <div className={css.header}><div><h2>{t('fieldsAndContext')}</h2><p>{t('sharedFields')}</p></div>{action}</div>
    {fields.length ? fields.map(f => <div key={f.id} className={css.observation}><strong>{f.name}</strong><p>{f.areaHa ?? '—'} ha · {f.evidence}</p>{f.notes.map((n, i) => <p key={i}>{n}</p>)}{Object.entries(f.years).map(([year, y]) => <p key={year}>{year} · {cropLabel(t, y.crop)} · {y.notes.join(' · ')}</p>)}</div>) : <p>{t('noFields')}</p>}
  </section>
}
/**
 * My farm fields table: one row per field with its area and the crop recorded for each recent year.
 * @param props - All field records, the selected field id if any, an optional `condition` text per field for a last column, and the card's actions.
 * @returns The fields card. With a field selected only its row is shown; year columns still cover every field so they do not move.
 */
export function FieldsTable({ fields, selectedId, t, condition, actions }: { fields: FarmState['fields']; selectedId?: string | null; t: T; condition?: ((field: Field) => string) | undefined; actions?: ReactNode }): ReactNode {
  const years = [...new Set(fields.flatMap(f => Object.keys(f.years)))].sort((a, b) => Number(a) - Number(b)).slice(-yearColumns)
  const rows = fields.some(f => f.id === selectedId) ? fields.filter(f => f.id === selectedId) : fields
  const cell = (entry: Field['years'][string] | undefined) => entry?.crop ? <CropPill crop={entry.crop} t={t} /> : entry?.notes[0] ? <span className={own.note}>{shortYearNote(entry.notes[0])}</span> : <span className={own.muted}>—</span>
  // A name such as "West strip · Brookings example" keeps its qualifier on a second, quieter line.
  const name = (f: Field) => { const [first, ...rest] = f.name.split(' · '); return rest.length ? <>{first}<span className={own.rowLine}>{rest.join(' · ')}</span></> : f.name }
  return <section className={css.card} aria-label={t('fieldsCard')}>
    <h2>{t('fieldsCard')}</h2>
    {fields.length ? <div className={css.tableScroll}><table className={own.table}>
      <thead><tr><th scope="col">{t('fieldName')}</th><th scope="col">{t('acres')}</th>{years.map(y => <th scope="col" key={y}>{y}</th>)}{condition && <th scope="col">{t('conditionsColumn')}</th>}</tr></thead>
      <tbody>{rows.map(f => <tr key={f.id}><th scope="row">{name(f)}</th><td>{fieldAcres(f) ?? <span className={own.muted}>—</span>}</td>{years.map(y => <td key={y}>{cell(f.years[y])}</td>)}{condition && <td className={own.nowrap}>{condition(f)}</td>}</tr>)}</tbody>
    </table></div> : <p>{t('fieldsEmpty')}</p>}
    {actions && <div className={own.cardActions}>{actions}</div>}
  </section>
}
