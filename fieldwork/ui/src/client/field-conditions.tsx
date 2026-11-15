/** Field conditions on My farm: saved NASA data as one table per tab, weather and crop growth, with soil stated as not measured. Past seasons only; nothing here changes a plan. */
import { useId, useState, type ReactNode } from 'react'
import { Button, SegmentedTabs, type SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import { fieldLocation } from '../../../plugins/farm-picture-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
import type { FieldYear, NasaCheck } from '../../../plugins/rotation-signals-domain.ts'
import { CropPill } from './fields.tsx'
import type { FieldworkKey } from './locales.ts'
import { NASA_TEST_OUTLINE, NasaCheckDialog, useNasaChecks } from './nasa-checks.tsx'
import css from './page.module.css'
import own from './my-farm.module.css'

type T = (key: FieldworkKey) => string
type Field = FarmState['fields'][number]
type Tab = 'weather' | 'growth' | 'soil'
/** One field's part of a table: its name, what is saved for it, and whether data can be read for it. */
interface Group { id: string; label: string; check: NasaCheck | undefined; can: boolean; point: boolean; test: boolean }
const columns: Record<Exclude<Tab, 'soil'>, FieldworkKey[]> = { weather: ['nasaYear', 'nasaCrop', 'nasaSeason', 'nasaRain', 'nasaSpringRain'], growth: ['nasaYear', 'nasaCrop', 'nasaSeason', 'nasaPeak', 'nasaUsual', 'nasaLower'] }
const pct = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%`
const num = (v: number | null) => v === null ? '—' : v.toFixed(2)
/** Only seasons that have data for the tab are listed: any weather value, or a greenness reading. */
const listed: Record<Exclude<Tab, 'soil'>, (y: FieldYear) => boolean> = { weather: y => y.unusual !== null || y.rainShare !== null || y.springRainShare !== null, growth: y => y.greenness !== null }
/**
 * Whether NASA data can be read for a field: it needs an outline, a point, or the circle Farm setup stores.
 * @param field - Field record.
 * @returns True when the field has a location that can be read.
 */
export function canCheck(field: Field): boolean {
  const geometry = field.geometry as { shape?: { type?: string } } | undefined
  return fieldLocation(field.geometry) !== undefined || geometry?.shape?.type === 'circle'
}

/**
 * Field conditions card for My farm. Tabs switch between weather, crop growth and soil; each table lists every season that has data, for every field or only the selected one.
 * @param props - Field records, the selected field id if any, and the dictionary lookup.
 * @returns The card, or nothing while the NASA checks plugin is loading or when it is not installed.
 */
export function FieldConditions({ fields, selectedId, t }: { fields: FarmState['fields']; selectedId?: string | null; t: T }): ReactNode {
  const s = useNasaChecks()
  const [tab, setTab] = useState<Tab>('weather')
  const id = useId()
  if (s.status === null || s.status === 'absent') return null
  const checks = s.status.checks, saved = (fieldId: string) => checks.find(c => c.fieldId === fieldId)
  const selected = fields.find(f => f.id === selectedId)
  const groups: Group[] = (selected ? [selected] : fields).map(f => ({ id: f.id, label: f.name, check: saved(f.id), can: canCheck(f), point: fieldLocation(f.geometry)?.kind === 'point', test: false }))
  // With no field that can be read, the hand-drawn test outline shows what the tables look like.
  if (!fields.some(canCheck)) groups.push({ id: NASA_TEST_OUTLINE, label: t('nasaTestOutline'), check: saved(NASA_TEST_OUTLINE), can: true, point: false, test: true })
  // This card owns the dialog and the error for the farm's fields and the test outline.
  const mine = (fieldId: string | null | undefined) => fieldId === NASA_TEST_OUTLINE || fields.some(f => f.id === fieldId)
  const body = (fieldId: string) => fieldId === NASA_TEST_OUTLINE ? { demo: true as const } : { fieldId }
  const get = (g: Group, size: 'sm' | 'md' = 'sm') => {
    const label = t(g.check ? 'conditionsUpdate' : 'conditionsGet')
    return <Button variant="outline" size={size} disabled={s.running !== null} aria-label={`${label} · ${g.label}`} onClick={() => void s.run(body(g.id), g.id, false)}>{s.running === g.id ? t('conditionsReading') : label}</Button>
  }
  const season = (y: FieldYear) => [y.dry && t('nasaDry'), y.hot && t('nasaHot'), y.wetSpring && t('nasaWetSpring')].filter(Boolean).join(', ') || (y.unusual === null ? '—' : t('nasaNormal'))
  const item = (value: Tab, label: FieldworkKey): SegmentedTab<Tab> => ({ value, label: t(label), id: `${id}-${value}`, panelId: `${id}-panel` })
  const table = (kind: Exclude<Tab, 'soil'>) => <div className={css.tableScroll}><table className={own.table} data-tinted="true">
    <thead><tr>{columns[kind].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead>
    {groups.map(g => {
      const [name, ...rest] = g.label.split(' · ')
      const state = !g.can ? t('conditionsNoLocation') : g.check ? `${t('conditionsChecked')} ${g.check.checkedAt.slice(0, 10)}` : t('conditionsNotChecked')
      const years = g.check?.years.filter(listed[kind]) ?? []
      // A site point has no area to read, so it never has crop growth; a field with an outline may have no clear image.
      const none = kind === 'growth' && (g.check?.outline === 'point' || g.point) ? t('conditionsPointOnly') : !g.check ? undefined : kind === 'weather' ? t('notRecorded') : t(g.check.greenness.connected ? 'conditionsNoGreenness' : 'nasaNoGreenness')
      return <tbody key={g.id}>
        <tr className={own.group}><th scope="rowgroup" colSpan={columns[kind].length}><div className={own.groupHead}><span><span className={own.groupName}>{name}</span><span className={own.groupNote}>{[...rest, state].join(' · ')}</span></span>{g.can && (!g.check || g.test) && get(g)}</div></th></tr>
        {years.map(y => <tr key={y.year} data-unusual={y.unusual === true}>
          <th scope="row">{y.year}</th><td>{y.crop === 'unknown' ? <span className={own.muted}>—</span> : <CropPill crop={y.crop} t={t} />}</td><td>{season(y)}</td>
          {kind === 'weather' ? <><td>{pct(y.rainShare)}</td><td>{pct(y.springRainShare)}</td></> : <><td>{num(y.greenness)}</td><td>{num(y.usualGreenness)}</td><td>{y.hit === null ? '—' : t(y.hit ? 'nasaYes' : 'nasaNo')}</td></>}
        </tr>)}
        {!years.length && none && <tr><td className={own.muted} colSpan={columns[kind].length}>{none}</td></tr>}
      </tbody>
    })}
  </table></div>
  const one = selected && saved(selected.id)
  return <section className={css.card} aria-label={t('conditionsTitle')}>
    <div className={own.cardHead}><div><h2>{t('conditionsTitle')}</h2><p>{t('conditionsIntro')}</p></div><p className={own.connection} data-connected={s.status.connected}>{t('nasaEarthdata')}: {t(s.status.connected ? 'nasaConnected' : 'nasaNotConnected')}</p></div>
    <SegmentedTabs className={own.tabs!} size="sm" label={t('conditionsTabs')} value={tab} onChange={setTab} items={[item('weather', 'conditionsWeather'), item('growth', 'conditionsGrowth'), item('soil', 'conditionsSoil')]} />
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
      {tab === 'soil'
        ? <><p className={own.pending}>{t('conditionsSoilNone')}</p><p className={css.notice}>{t('conditionsSoilPlan')}</p></>
        : <>
          <p className={css.notice}>{t(tab === 'weather' ? 'conditionsWeatherHow' : 'conditionsGrowthHow')}</p>
          {!s.status.connected && tab === 'growth' && <p className={css.notice}>{t('nasaConnectHow')}</p>}
          {s.error !== null && mine(s.errorFor) && <p role="alert" className={css.error}>{s.error || t('conditionsFailed')}</p>}
          {s.running && <p role="status" className={css.notice}>{t('nasaRunningLong')}</p>}
          {table(tab)}
          {one && selected && <div className={own.cardActions}><Button variant="outline" onClick={() => s.setOpen(one)}>{t('conditionsSources')}</Button>{get({ id: selected.id, label: selected.name, check: one, can: true, point: false, test: false }, 'md')}</div>}
          <p className={own.source}>{tab === 'weather' && <>{t('conditionsWeatherSource')} </>}{t('conditionsReads')}</p>
        </>}
    </div>
    <NasaCheckDialog check={s.open && mine(s.open.fieldId) ? s.open : null} onClose={() => s.setOpen(null)} t={t} onRerun={() => { if (s.open) void s.run(body(s.open.fieldId), s.open.fieldId) }} />
  </section>
}
