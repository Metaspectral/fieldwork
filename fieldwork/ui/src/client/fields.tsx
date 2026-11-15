/** Shared field context is visible from both My farm and corn planning. */
import type { ReactNode } from 'react'
import type { FarmState } from '../../../plugins/records.ts'
import type { FieldworkKey } from './locales.ts'
import css from './page.module.css'
export function FieldContext({ fields, t, action }: { fields: FarmState['fields']; t(key: FieldworkKey): string; action?: ReactNode }): ReactNode {
  return <section className={css.card}>
    <div className={css.header}><div><h2>{t('fieldsAndContext')}</h2><p>{t('sharedFields')}</p></div>{action}</div>
    {fields.length ? fields.map(f => <div key={f.id} className={css.observation}><strong>{f.name}</strong><p>{f.areaHa ?? '—'} ha · {f.evidence}</p>{f.notes.map((n, i) => <p key={i}>{n}</p>)}{Object.entries(f.years).map(([year, y]) => <p key={year}>{year} · {y.crop ?? '—'} · {y.notes.join(' · ')}</p>)}</div>) : <p>{t('noFields')}</p>}
  </section>
}
