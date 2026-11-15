/** Past seasons and risk on Rotation: for each field and each crop in its plan, counts of past seasons from the saved NASA data. Past seasons only; nothing here changes a plan. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FarmState } from '../../../plugins/records.ts'
import { plannedCrop, type RotationPlan } from '../../../plugins/rotation-domain.ts'
import type { FieldYear } from '../../../plugins/rotation-signals-domain.ts'
import { canCheck } from './field-conditions.tsx'
import { CropPill, cropLabel } from './fields.tsx'
import type { FieldworkKey } from './locales.ts'
import { NasaCheckDialog, useNasaChecks } from './nasa-checks.tsx'
import css from './page.module.css'
import own from './my-farm.module.css'

type T = (key: FieldworkKey) => string
const columns: FieldworkKey[] = ['nasaCrop', 'riskPlanned', 'riskGrown', 'riskUnusual', 'riskLower']

/**
 * Past seasons and risk card for Rotation. Each field lists the crops in its plan, then any other crop it grew, with how many recorded seasons were unusual and in how many of those growth was below usual.
 * @param props - The shown fields, a lookup of the plan drawn for a field, the planned seasons, and the dictionary lookup.
 * @returns The card, or nothing with no field, while the NASA checks plugin is loading, or when it is not installed.
 */
export function RotationRisk({ fields, planFor, seasons, t }: { fields: FarmState['fields']; planFor(fieldId: string): RotationPlan | undefined; seasons: readonly number[]; t: T }): ReactNode {
  const s = useNasaChecks()
  if (s.status === null || s.status === 'absent' || !fields.length) return null
  const checks = s.status.checks
  const mine = (fieldId: string | null | undefined) => fields.some(f => f.id === fieldId)
  const flags = (y: FieldYear) => [y.dry && t('nasaDry'), y.hot && t('nasaHot'), y.wetSpring && t('nasaWetSpring')].filter(Boolean).join(', ').toLowerCase()
  const count = (n: number, known: number) => `${n} ${t('countOf')} ${known}`
  const dash = <span className={own.muted}>—</span>
  return <section className={css.card} aria-label={t('riskTitle')}>
    <div className={own.cardHead}><div><h2>{t('riskTitle')}</h2><p>{t('riskIntro')}</p></div></div>
    {s.error !== null && mine(s.errorFor) && <p role="alert" className={css.error}>{s.error || t('conditionsFailed')}</p>}
    {s.running && <p role="status" className={css.notice}>{t('nasaRunningLong')}</p>}
    <div className={css.tableScroll}><table className={own.table} data-tinted="true">
      <thead><tr>{columns.map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead>
      {fields.map(f => {
        const check = checks.find(c => c.fieldId === f.id), plan = planFor(f.id), can = canCheck(f)
        const [name, ...rest] = f.name.split(' · ')
        const state = check ? `${t('conditionsChecked')} ${check.checkedAt.slice(0, 10)}` : t(can ? 'conditionsNotChecked' : 'conditionsNoLocation')
        const planned = new Map<string, number[]>()
        if (plan) for (const y of seasons) { const crop = plannedCrop(plan, y); if (crop) planned.set(crop, [...planned.get(crop) ?? [], y]) }
        const grown = check?.years.filter(y => y.crop !== 'unknown') ?? []
        // Crops of the plan come first, in the order they are planned; other crops the field grew follow.
        const crops = [...new Set([...planned.keys(), ...grown.map(y => y.crop)])]
        const odds = check?.odds.unusual
        const get = t('conditionsGet'), sources = t('conditionsSources')
        return <tbody key={f.id}>
          <tr className={own.group}><th scope="rowgroup" colSpan={columns.length}><div className={own.groupHead}>
            <span><span className={own.groupName}>{name}</span><span className={own.groupNote}>{[...rest, state].join(' · ')}</span></span>
            {check ? <Button variant="outline" size="sm" aria-label={`${sources} · ${f.name}`} onClick={() => s.setOpen(check)}>{sources}</Button>
              : can && <Button variant="outline" size="sm" disabled={s.running !== null} aria-label={`${get} · ${f.name}`} onClick={() => void s.run({ fieldId: f.id }, f.id, false)}>{s.running === f.id ? t('conditionsReading') : get}</Button>}
          </div></th></tr>
          {check && odds && <tr><td colSpan={columns.length}>{t('nasaOddsTitle')} · {cropLabel(t, check.oddsCrop).toLowerCase()}: {odds.earlier.from}–{odds.earlier.to} {count(odds.earlier.count, odds.earlier.known)} · {odds.recent.from}–{odds.recent.to} {count(odds.recent.count, odds.recent.known)} · {t(odds.moreOften ? 'nasaMoreOften' : 'nasaNoClaim')}</td></tr>}
          {check && crops.map(crop => {
            const seasonsGrown = grown.filter(y => y.crop === crop), known = seasonsGrown.filter(y => y.unusual !== null), unusual = known.filter(y => y.unusual === true)
            const summary = check.crops.find(c => c.crop === crop)
            return <tr key={crop}>
              <th scope="row"><CropPill crop={crop} t={t} /></th>
              <td>{planned.get(crop)?.join(', ') ?? dash}</td>
              <td>{seasonsGrown.length}{seasonsGrown.length > 0 && <span className={own.rowLine}>{seasonsGrown.map(y => y.year).join(', ')}</span>}</td>
              <td>{known.length ? <>{count(unusual.length, known.length)}{unusual.length > 0 && <span className={own.rowLine}>{unusual.map(y => `${y.year} ${flags(y)}`).join(' · ')}</span>}</> : dash}</td>
              <td>{!unusual.length ? dash : summary?.withGreenness ? <>{count(summary.hits.length, summary.withGreenness)}{summary.hits.length > 0 && <span className={own.rowLine}>{summary.hits.join(', ')}</span>}</> : <span className={own.muted}>{t('conditionsNoGreenness')}</span>}</td>
            </tr>
          })}
        </tbody>
      })}
    </table></div>
    <p className={own.source}>{t('riskLimits')} {t('conditionsReads')}</p>
    <NasaCheckDialog check={s.open && mine(s.open.fieldId) ? s.open : null} onClose={() => s.setOpen(null)} t={t} onRerun={() => { if (s.open) void s.run({ fieldId: s.open.fieldId }, s.open.fieldId) }} />
  </section>
}
