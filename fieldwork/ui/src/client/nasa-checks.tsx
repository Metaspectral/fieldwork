/** NASA checks for rotation plans: one action per field, a dialog with odds from past seasons and the field's own record. Drawn only when the plugin is installed. */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FarmState } from '../../../plugins/records.ts'
import { expectedProfit, type Flag, type FlagOdds, type NasaCheck, type NasaStatus } from '../../../plugins/rotation-signals-domain.ts'
import type { FieldworkKey } from './locales.ts'
import css from './page.module.css'
import own from './nasa-checks.module.css'

type T = (key: FieldworkKey) => string
const ROUTE = 'fieldwork-nasa-checks'
const pct = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)}%`
const num = (v: number | null, places = 2) => v === null ? '—' : v.toFixed(places)

let first: Promise<NasaStatus | 'absent'> | null = null
/** One status request per page load, shared by every action on the page. */
function loadStatus(): Promise<NasaStatus | 'absent'> {
  first ??= fetch(new URL(ROUTE, document.baseURI)).then(async r => r.ok ? await r.json() as NasaStatus : 'absent' as const).catch(() => 'absent' as const)
  return first
}

/** Shared request state for the page: status, a running field, the open check, and errors. */
function useNasaChecks() {
  const [status, setStatus] = useState<NasaStatus | null | 'absent'>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [open, setOpen] = useState<NasaCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void loadStatus().then(s => { if (live) setStatus(s) })
    return () => { live = false }
  }, [])
  const run = async (body: { fieldId: string } | { demo: true }, key: string) => {
    setRunning(key); setError(null)
    try {
      const r = await fetch(new URL(ROUTE, document.baseURI), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const reply = await r.json() as NasaStatus & { check?: NasaCheck; error?: string }
      if (!r.ok || !reply.check) { setError(reply.error ?? null); return }
      setStatus({ connected: reply.connected, checks: reply.checks }); setOpen(reply.check)
    } finally { setRunning(null) }
  }
  return { status, running, open, setOpen, error, run }
}

/** A card on My farm listing fields with a "NASA checks" action each, plus the test outline. */
export function NasaChecksCard({ fields, t }: { fields: FarmState['fields']; t: T }): ReactNode {
  const s = useNasaChecks()
  if (s.status === null || s.status === 'absent') return null
  const located = fields.filter(f => (f.geometry as { shape?: { type?: string } } | undefined)?.shape?.type === 'circle')
  const saved = (id: string) => s.status !== null && s.status !== 'absent' ? s.status.checks.find(c => c.fieldId === id) : undefined
  const action = (key: string, body: { fieldId: string } | { demo: true }, label: string) => {
    const last = saved(key)
    return <div className={own.row} key={key}>
      <span>{label}{last && <small> · {t('nasaLastChecked')} {last.checkedAt.slice(0, 10)}</small>}</span>
      <span className={css.actions}>
        {last && <Button variant="outline" onClick={() => s.setOpen(last)}>{t('nasaView')}</Button>}
        <Button variant="primary" disabled={s.running !== null} onClick={() => void s.run(body, key)}>{s.running === key ? t('nasaRunning') : t('nasaChecks')}</Button>
      </span>
    </div>
  }
  return <section className={css.card} aria-label={t('nasaTitle')}>
    <div className={css.header}><div><h2>{t('nasaTitle')}</h2><p>{t('nasaIntro')}</p></div></div>
    <p className={own.connection} data-connected={s.status.connected}>{t('nasaEarthdata')}: {t(s.status.connected ? 'nasaConnected' : 'nasaNotConnected')}</p>
    {!s.status.connected && <p className={css.notice}>{t('nasaConnectHow')}</p>}
    <p className={css.notice}>{t('nasaReads')}</p>
    {s.error && <p role="alert" className={css.error}>{s.error}</p>}
    {s.running && <p role="status" className={css.notice}>{t('nasaRunningLong')}</p>}
    {located.map(f => action(f.id, { fieldId: f.id }, f.name))}
    {action('nasa-test-brookings', { demo: true }, t('nasaTestOutline'))}
    <NasaCheckDialog check={s.open} onClose={() => s.setOpen(null)} t={t} />
  </section>
}

/** The "NASA checks" action in a Rotation table row; not drawn when the plugin is absent. */
export function NasaChecksAction({ fieldId, t }: { fieldId: string; t: T }): ReactNode {
  const s = useNasaChecks()
  if (s.status === null || s.status === 'absent') return null
  const last = s.status.checks.find(c => c.fieldId === fieldId)
  return <>
    <Button variant="outline" disabled={s.running !== null} onClick={() => last ? s.setOpen(last) : void s.run({ fieldId }, fieldId)}>{s.running === fieldId ? t('nasaRunning') : t('nasaChecks')}</Button>
    {s.error && <span role="alert" className={css.error}>{s.error}</span>}
    <NasaCheckDialog check={s.open} onClose={() => s.setOpen(null)} t={t} onRerun={() => void s.run({ fieldId }, fieldId)} />
  </>
}

function OddsRow({ label, odds, t }: { label: string; odds: FlagOdds; t: T }): ReactNode {
  const cell = (c: FlagOdds['earlier']) => `${c.count} / ${c.known} (${pct(c.share)})`
  return <tr><th scope="row">{label}</th><td>{cell(odds.earlier)}</td><td>{cell(odds.recent)}</td><td>{odds.moreOften ? t('nasaMoreOften') : t('nasaNoClaim')}</td></tr>
}

/** The full check for one field. Nothing in it changes a plan. */
export function NasaCheckDialog({ check, onClose, t, onRerun }: { check: NasaCheck | null; onClose(): void; t: T; onRerun?: () => void }): ReactNode {
  const [normal, setNormal] = useState('')
  const [unusual, setUnusual] = useState('')
  if (!check) return null
  const flags: [Flag, FieldworkKey][] = [['unusual', 'nasaAnyUnusual'], ['dry', 'nasaDry'], ['wetSpring', 'nasaWetSpring'], ['hot', 'nasaHot']]
  const n = Number(normal), u = Number(unusual), ready = normal !== '' && unusual !== '' && Number.isFinite(n) && Number.isFinite(u)
  const e = check.odds.unusual
  const flagText = (y: NasaCheck['years'][number]) => [y.dry && t('nasaDry'), y.hot && t('nasaHot'), y.wetSpring && t('nasaWetSpring')].filter(Boolean).join(', ') || (y.unusual === null ? '—' : t('nasaNormal'))
  return <Modal open onClose={onClose} closeLabel={t('close')} title={`${t('nasaChecks')} · ${check.fieldName}`}>
    <div className={own.dialog}>
      <p className={css.notice}>{check.location.latitude}, {check.location.longitude} · {check.location.areaHa} ha · {t('nasaChecked')} {check.checkedAt.slice(0, 10)}{check.demo && <> · <strong>{t('nasaTestLabel')}</strong></>}</p>
      <p className={own.lead}>{t('nasaInforms')}</p>
      <h3>{t('nasaOddsTitle')} ({check.oddsCrop})</h3>
      <table className={own.table}><thead><tr><th scope="col">{t('nasaSeason')}</th><th scope="col">{e.earlier.from}–{e.earlier.to}</th><th scope="col">{e.recent.from}–{e.recent.to}</th><th scope="col">{t('nasaChange')}</th></tr></thead>
        <tbody>{flags.map(([k, label]) => <OddsRow key={k} label={t(label)} odds={check.odds[k]} t={t} />)}</tbody></table>
      <p className={css.notice}>{t('nasaRules')}</p>
      <h3>{t('nasaFieldTitle')}</h3>
      <p className={css.notice}>{check.greenness.connected ? `${t('nasaGreennessFrom')} ${check.greenness.seasons} · ${t('nasaScenes')} ${check.greenness.scenesUsed} / ${check.greenness.scenesFound}` : t('nasaNoGreenness')}{check.greenness.note && ` · ${check.greenness.note}`}</p>
      <table className={own.table}><thead><tr><th scope="col">{t('nasaYear')}</th><th scope="col">{t('crop')}</th><th scope="col">{t('nasaSeason')}</th><th scope="col">{t('nasaRain')}</th><th scope="col">{t('nasaSpringRain')}</th><th scope="col">{t('nasaPeak')}</th><th scope="col">{t('nasaUsual')}</th><th scope="col">{t('nasaLower')}</th></tr></thead>
        <tbody>{check.years.map(y => <tr key={y.year} data-unusual={y.unusual === true}><th scope="row">{y.year}</th><td>{y.crop}{y.cropSource === 'farmer' && ' *'}</td><td>{flagText(y)}</td><td>{pct(y.rainShare)}</td><td>{pct(y.springRainShare)}</td><td>{num(y.greenness)}</td><td>{num(y.usualGreenness)}</td><td>{y.hit === null ? '—' : t(y.hit ? 'nasaYes' : 'nasaNo')}</td></tr>)}</tbody></table>
      <h3>{t('nasaByCrop')}</h3>
      <ul>{check.crops.map(c => <li key={c.crop}><strong>{c.crop}</strong>: {t('nasaUnusualSeasons')} {c.unusualSeasons.join(', ') || '—'} · {t('nasaLowerIn')} {c.hits.join(', ') || '—'} ({c.hits.length} / {c.withGreenness} {t('nasaWithReading')})</li>)}</ul>
      <h3>{t('nasaProfitTitle')}</h3>
      <p className={css.notice}>{t('nasaProfitHow')}</p>
      <div className={css.grid}>
        <label className={css.field}>{t('nasaNormalProfit')}<input type="number" step="any" value={normal} onChange={ev => setNormal(ev.target.value)} /></label>
        <label className={css.field}>{t('nasaUnusualProfit')}<input type="number" step="any" value={unusual} onChange={ev => setUnusual(ev.target.value)} /></label>
      </div>
      {ready && e.earlier.share !== null && e.recent.share !== null && <table className={own.table}><tbody>
        <tr><th scope="row">{t('nasaExpected')} · {e.earlier.from}–{e.earlier.to} ({pct(e.earlier.share)})</th><td>{expectedProfit(n, u, e.earlier.share).toFixed(0)}</td></tr>
        <tr><th scope="row">{t('nasaExpected')} · {e.recent.from}–{e.recent.to} ({pct(e.recent.share)})</th><td>{expectedProfit(n, u, e.recent.share).toFixed(0)}</td></tr>
      </tbody></table>}
      <h3>{t('nasaSources')}</h3>
      <ul>{check.sources.map(s => <li key={s.name}><strong>{s.name}</strong> · {s.detail} · <code>{s.address}</code></li>)}</ul>
      <h3>{t('nasaLimits')}</h3>
      <ul>{check.limits.map(l => <li key={l}>{l}</li>)}</ul>
      <p className={css.notice}>{t('nasaNoChange')}</p>
      {onRerun && <div className={css.actions}><Button onClick={() => { onClose(); onRerun() }}>{t('nasaRerun')}</Button></div>}
    </div>
  </Modal>
}
