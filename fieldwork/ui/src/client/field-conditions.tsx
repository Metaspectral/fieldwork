/** Field conditions on My farm: saved NASA checks grouped as weather, crop growth and soil. Past seasons only; nothing here changes a plan. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { fieldLocation } from '../../../plugins/farm-picture-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
import type { Flag, NasaCheck, PeriodCount } from '../../../plugins/rotation-signals-domain.ts'
import type { FieldworkKey } from './locales.ts'
import { cropLabel } from './rotation.tsx'
import { NASA_TEST_OUTLINE, NasaCheckDialog, useNasaChecks } from './nasa-checks.tsx'
import css from './page.module.css'
import own from './my-farm.module.css'

type T = (key: FieldworkKey) => string
type Field = FarmState['fields'][number]
const flags: [Flag, FieldworkKey][] = [['unusual', 'nasaAnyUnusual'], ['wetSpring', 'nasaWetSpring'], ['hot', 'nasaHot'], ['dry', 'nasaDry']]
const shortName = (name: string) => name.split(' · ')[0] ?? name
const day = (check: NasaCheck) => check.checkedAt.slice(0, 10)
const pct = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%`
const num = (v: number | null) => v === null ? '—' : v.toFixed(2)
const count = (c: PeriodCount) => `${c.count} / ${c.known}`
/** A season with no recorded crop is stored as `unknown`. */
const cropName = (t: T, crop: string) => crop === 'unknown' ? '—' : cropLabel(t, crop)
/** The most recent season with a greenness reading; a weather-only check has none. */
const latestGrowth = (check: NasaCheck) => [...check.years].sort((a, b) => b.year - a.year).find(y => y.greenness !== null)
/**
 * Whether a check can run for a field: it needs an outline, a point, or the circle Farm setup stores.
 * @param field - Field record.
 * @returns True when the field has a location a check can use.
 */
export function canCheck(field: Field): boolean {
  const geometry = field.geometry as { shape?: { type?: string } } | undefined
  return fieldLocation(field.geometry) !== undefined || geometry?.shape?.type === 'circle'
}

function Weather({ check, t }: { check: NasaCheck | undefined; t: T }): ReactNode {
  if (!check) return <section className={own.panel}><h3>{t('conditionsWeather')}</h3><p className={css.notice}>{t('conditionsWeatherEmpty')}</p></section>
  const span = check.odds.unusual
  return <section className={own.panel}>
    <h3>{t('conditionsWeather')}</h3>
    <p className={css.notice}>{t('conditionsWeatherHow')}</p>
    <table className={own.table}>
      <thead><tr><th scope="col">{t('nasaSeason')}</th><th scope="col">{span.earlier.from}–{span.earlier.to}</th><th scope="col">{span.recent.from}–{span.recent.to}</th></tr></thead>
      <tbody>{flags.map(([flag, label]) => <tr key={flag}><th scope="row">{t(label)}</th><td>{count(check.odds[flag].earlier)}</td><td>{count(check.odds[flag].recent)}</td></tr>)}</tbody>
    </table>
    <p className={own.source}>{shortName(check.fieldName)} · {cropName(t, check.oddsCrop)} · {t('nasaChecked')} {day(check)}</p>
    <p className={own.source}>{t('conditionsWeatherSource')}</p>
  </section>
}

function Soil({ t }: { t: T }): ReactNode {
  return <section className={own.panel} data-pending="true"><h3>{t('conditionsSoil')}</h3><p className={own.pending}>{t('conditionsSoilNone')}</p><p className={css.notice}>{t('conditionsSoilPlan')}</p></section>
}

/**
 * Field conditions card for My farm. With no field selected it lists every field that can be checked; with one selected it shows that field's weather odds, latest crop growth and season-by-season record.
 * @param props - Field records, the selected field id if any, `select` to change the selection, and the dictionary lookup.
 * @returns The card, or nothing while the NASA checks plugin is loading or when it is not installed.
 */
export function FieldConditions({ fields, selectedId, select, t }: { fields: FarmState['fields']; selectedId?: string | null; select(fieldId: string | null): void; t: T }): ReactNode {
  const s = useNasaChecks()
  if (s.status === null || s.status === 'absent') return null
  const checks = s.status.checks, saved = (id: string) => checks.find(c => c.fieldId === id)
  const selected = fields.find(f => f.id === selectedId), checkable = fields.filter(canCheck)
  // This card owns the dialog and the error for the farm's fields and the test outline; a Rotation row owns its own.
  const mine = (id: string | null | undefined) => id === NASA_TEST_OUTLINE || fields.some(f => f.id === id)
  const body = (id: string) => id === NASA_TEST_OUTLINE ? { demo: true as const } : { fieldId: id }
  const check = (id: string, label: string, again: boolean, size: 'sm' | 'md' = 'sm') => <Button variant="outline" size={size} disabled={s.running !== null} aria-label={`${t(again ? 'conditionsCheckAgain' : 'conditionsCheck')} · ${label}`} onClick={() => void s.run(body(id), id)}>{s.running === id ? t('nasaRunning') : t(again ? 'conditionsCheckAgain' : 'conditionsCheck')}</Button>
  // A site point has no area, so its check can only ever return weather; say so before the farmer runs one.
  const pointOnly = (f: Field) => fieldLocation(f.geometry)?.kind === 'point'
  const growthLine = (last: NasaCheck | undefined) => {
    if (last?.outline === 'point') return t('conditionsPointOnly')
    if (!last) return t('conditionsNotChecked')
    const y = latestGrowth(last)
    return y ? `${y.year} ${cropName(t, y.crop)} · ${t('nasaPeak')} ${num(y.greenness)} · ${t('nasaUsual')} ${num(y.usualGreenness)}` : t('conditionsNoGreenness')
  }
  const flagText = (y: NasaCheck['years'][number]) => [y.dry && t('nasaDry'), y.hot && t('nasaHot'), y.wetSpring && t('nasaWetSpring')].filter(Boolean).join(', ') || (y.unusual === null ? '—' : t('nasaNormal'))
  // With every field shown, weather comes from the most recent check: fields this close share one weather grid cell.
  const one = selected && saved(selected.id), newest = [...checks].filter(c => fields.some(f => f.id === c.fieldId)).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0]
  const growth = one && latestGrowth(one), test = saved(NASA_TEST_OUTLINE)
  return <section className={css.card} aria-label={t('conditionsTitle')}>
    <div className={own.cardHead}><div><h2>{t('conditionsTitle')}</h2><p>{t('conditionsIntro')}</p></div><p className={own.connection} data-connected={s.status.connected}>{t('nasaEarthdata')}: {t(s.status.connected ? 'nasaConnected' : 'nasaNotConnected')}</p></div>
    {!s.status.connected && <p className={css.notice}>{t('nasaConnectHow')}</p>}
    {s.error && mine(s.errorFor) && <p role="alert" className={css.error}>{s.error}</p>}
    {s.running && <p role="status" className={css.notice}>{t('nasaRunningLong')}</p>}
    <div className={own.panels}>
      <Weather check={selected ? one : newest} t={t} />
      <section className={own.panel}>
        <h3>{t('conditionsGrowth')}</h3>
        <p className={css.notice}>{t('conditionsGrowthHow')}</p>
        {selected
          ? growth
            ? <><p className={own.figure}>{num(growth.greenness)}</p><p className={own.figureLabel}>{t('nasaPeak')} · {growth.year} {cropName(t, growth.crop)}</p><p>{t('nasaUsual')} {num(growth.usualGreenness)}{growth.hit !== null && <> · {t(growth.hit ? 'conditionsLower' : 'conditionsNotLower')}</>}</p></>
            : <p>{!canCheck(selected) ? t('conditionsNoLocation') : pointOnly(selected) ? t('conditionsPointOnly') : growthLine(one)}</p>
          : <ul className={own.rows}>
            {checkable.map(f => { const last = saved(f.id); return <li key={f.id}><div><span className={own.rowName}>{shortName(f.name)}</span><span className={own.rowLine}>{!last && pointOnly(f) ? t('conditionsPointOnly') : growthLine(last)}</span></div>{last ? <Button variant="outline" size="sm" aria-label={`${t('conditionsView')} · ${f.name}`} onClick={() => select(f.id)}>{t('conditionsView')}</Button> : check(f.id, f.name, false)}</li> })}
            {!checkable.length && <li><div><span className={own.rowName}>{t('nasaTestOutline')}</span><span className={own.rowLine}>{growthLine(test)}</span></div><span className={css.rowActions}>{test && <Button variant="outline" size="sm" onClick={() => s.setOpen(test)}>{t('nasaView')}</Button>}{check(NASA_TEST_OUTLINE, t('nasaTestOutline'), test !== undefined)}</span></li>}
          </ul>}
      </section>
      <Soil t={t} />
    </div>
    {one && <>
      <h3>{t('conditionsSeasons')}</h3>
      <div className={css.tableScroll}><table className={own.table} data-tinted="true">
        <thead><tr><th scope="col">{t('nasaYear')}</th><th scope="col">{t('nasaCrop')}</th><th scope="col">{t('nasaSeason')}</th><th scope="col">{t('nasaRain')}</th><th scope="col">{t('nasaPeak')}</th><th scope="col">{t('nasaUsual')}</th><th scope="col">{t('nasaLower')}</th></tr></thead>
        <tbody>{one.years.map(y => <tr key={y.year} data-unusual={y.unusual === true}><th scope="row">{y.year}</th><td>{cropName(t, y.crop)}</td><td>{flagText(y)}</td><td>{pct(y.rainShare)}</td><td>{num(y.greenness)}</td><td>{num(y.usualGreenness)}</td><td>{y.hit === null ? '—' : t(y.hit ? 'nasaYes' : 'nasaNo')}</td></tr>)}</tbody>
      </table></div>
    </>}
    {selected && canCheck(selected) && <div className={own.cardActions}>{one && <Button variant="outline" onClick={() => s.setOpen(one)}>{t('conditionsSources')}</Button>}{check(selected.id, selected.name, one !== undefined, 'md')}</div>}
    <p className={own.source}>{t('nasaReads')}</p>
    <NasaCheckDialog check={s.open && mine(s.open.fieldId) ? s.open : null} onClose={() => s.setOpen(null)} t={t} onRerun={() => { if (s.open) void s.run(body(s.open.fieldId), s.open.fieldId) }} />
  </section>
}
