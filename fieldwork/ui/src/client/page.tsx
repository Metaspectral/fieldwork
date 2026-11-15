/** Native Fieldwork panels built with Harness slots, theme, and UI primitives. */
import { useState, useId, type ReactNode, type FormEvent } from 'react'
import { Button, Modal, IconUsersOutlineRegular, IconListPenOutlineRegular, IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { FarmState } from '../../../plugins/records.ts'
import type { Face, Reply } from './controller.ts'
import css from './page.module.css'
/** Props are derived from the native slot and its injected data face. */
type Props = PropsRuntime<'main'> & PropsLocale<'fieldwork'> & InjectFace<Face>
type Review = { command: Record<string, unknown>; title: string; details: [string, string][] }
/** Reuse native artwork at the size owned by the sidebar. */
export function FarmIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode { return <IconLayersOutlineRegular size={size} /> }
/** Native community sidebar icon. */
export function CommunityIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode { return <IconUsersOutlineRegular size={size} /> }
/** Native experiment sidebar icon. */
export function ExperimentIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode { return <IconListPenOutlineRegular size={size} /> }
/** Render one panel while preserving local drafts through server updates. */
export function Page(props: Props): ReactNode {
  const { t } = props
  const formId = useId()
  const labels: Record<string, string> = { name: t('name'), region: t('region'), areaHa: t('area'), crop: t('crop'), approach: t('baseline'), reason: t('reason'), title: t('trialTitle'), trialAreaHa: t('trialArea'), baseline: t('baseline'), change: t('change'), observation: t('observation') }
  const state = props.useRecords(s => s)
  const [review, setReview] = useState<Review | null>(null)
  const [form, setForm] = useState<{ kind: 'plan' | 'edit' | 'observe' | 'share'; id?: string } | null>(null)
  const [preview, setPreview] = useState<Reply['preview']>(undefined)
  const [comparison, setComparison] = useState<FarmState['comparisons'][number] | null>(null)
  const [seedInput, setSeedInput] = useState<Record<string, unknown> | null>(null)
  const [completed, setCompleted] = useState(false)
  const ask = (command: Record<string, unknown>, title: string, details: [string, string][]) => { setReview({ command, title, details }) }
  const run = async (command: Record<string, unknown>) => { try { return await props.perform(command) } catch { return undefined } }
  const confirm = async () => { if (!review) return; const result = await run({ ...review.command, confirmed: true }); if (result) { setReview(null); setForm(null); setPreview(undefined); setCompleted(true) } }
  const input = (name: string, label: string, value: string | number, type = 'text', extra: Record<string, string | number> = {}) => <label className={css.field}>{label}<input name={name} defaultValue={value} type={type} required maxLength={2000} {...extra} /></label>
  const text = (name: string, label: string, value = '') => <div className={css.field}><label htmlFor={`${formId}-${name}`}>{label}</label><textarea id={`${formId}-${name}`} name={name} defaultValue={value} required maxLength={2000} /></div>
  const values = (event: FormEvent<HTMLFormElement>): Record<string, string> => { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string> }
  const f = state.data?.farm
  const trial = form?.id ? state.data?.trials.find(x => x.id === form.id) : undefined
  if (!state.data) return <section className={css.page}><h1>{t(props.section)}</h1><p role="status">{state.error ?? t('loading')}</p><Button onClick={() => void props.refresh()}>{t('retry')}</Button></section>
  return <section className={css.page}>
    <header className={css.header}><div><p className={css.brandLine}>{t('brandLine')}</p><h1>{t(props.section)}</h1><p>{t(props.section === 'farm' ? 'farmIntro' : props.section === 'community' ? 'communityIntro' : 'experimentsIntro')}</p></div><Button variant="outline" onClick={() => void props.refresh()}>{t('refresh')}</Button></header>
    <div className={css.status}><span>{t('local')}</span><span>{t(props.section === 'community' ? 'localFeed' : 'private')}</span></div>
    {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    {(completed || state.saved) && <p role="status" className={css.notice}>{t('saved')}</p>}
    {props.section === 'farm' && f && <>
      <form key={f.name + f.region + f.areaHa + f.approach + f.reason + f.crop} className={css.card} onSubmit={e => { const v = values(e); ask({ action: 'farm', farm: { ...v, areaHa: Number(v.areaHa) } }, t('saveFarm'), Object.entries(v).map(([k, v]) => [labels[k] ?? k, v])) }}>
        <h2>{t('baseline')}</h2><div className={css.grid}>{input('name', t('name'), f.name)}{input('region', t('region'), f.region)}{input('areaHa', t('area'), f.areaHa, 'number', { min: .01, max: 100000, step: 'any' })}{input('crop', t('crop'), f.crop)}</div>{text('approach', t('baseline'), f.approach)}{text('reason', t('reason'), f.reason)}<Button type="submit" variant="primary" disabled={state.busy}>{t('saveFarm')}</Button>
      </form>
      <form className={css.card} onSubmit={async e => { const v = values(e); const args = Object.fromEntries(Object.entries(v).map(([k, v]) => [k, Number(v)])); const r = await run({ action: 'seed', ...args }); if (r?.comparison) { setComparison(r.comparison); setSeedInput(args) } }}><h2>{t('seed')}</h2><p>{t('seedIntro')}</p><div className={css.grid}>{input('areaHa', t('area'), f.areaHa, 'number', { min: .01, step: 'any' })}{input('bagsPerHa', t('bags'), 1.5, 'number', { min: .01, step: 'any' })}{input('currentCadPerBag', t('currentQuote'), 120, 'number', { min: 0, step: 'any' })}{input('alternativeCadPerBag', t('alternativeQuote'), 108, 'number', { min: 0, step: 'any' })}</div><Button type="submit" variant="outline" disabled={state.busy}>{t('compare')}</Button>{comparison && <div className={css.result}><dl><dt>{t('currentCost')}</dt><dd>CAD {comparison.currentCad.toFixed(2)}</dd><dt>{t('alternativeCost')}</dt><dd>CAD {comparison.alternativeCad.toFixed(2)}</dd><dt>{t('difference')}</dt><dd>{comparison.savingCad.toFixed(2)}</dd></dl><Button onClick={() => ask({ action: 'save-seed', ...seedInput }, t('saveComparison'), [[t('currentCost'), `CAD ${comparison.currentCad}`], [t('alternativeCost'), `CAD ${comparison.alternativeCad}`], [t('difference'), `CAD ${comparison.savingCad}`]])}>{t('saveComparison')}</Button></div>}</form>
      <section className={css.card}><h2>{t('savedComparisons')}</h2>{state.data.comparisons.length ? state.data.comparisons.map(c => <p key={c.id}>{c.areaHa} ha · {c.bagsPerHa} bags/ha · CAD {c.currentCad.toFixed(2)} → CAD {c.alternativeCad.toFixed(2)}</p>) : <p>{t('none')}</p>}</section>
    </>}
    {props.section === 'community' && <div className={css.cards}>{state.data.summaries.map(p => <article key={p.id} className={css.card}><div className={css.meta}><span>{p.author}</span><span>{t(p.sample ? 'sample' : 'yourSummary')}</span></div><h2>{p.title}</h2><p>{p.takeaway}</p><details><summary>{t('method')}</summary><h3>{t('baseline')}</h3><p>{p.baseline}</p><h3>{t('change')}</h3><p>{p.change}</p><p>{t('source')}: {p.source}</p><p>{t('noPrescription')}</p></details><div className={css.actions}><Button variant="primary" onClick={() => ask({ action: 'adapt', postId: p.id }, t('adapt'), [[t('trialTitle'), p.title], [t('baseline'), p.baseline], [t('change'), p.change], [t('source'), p.source]])}>{t('adapt')}</Button>{!p.sample && <Button onClick={() => ask({ action: 'withdraw', id: p.id }, t('withdraw'), [[t('trialTitle'), p.title]])}>{t('withdraw')}</Button>}</div></article>)}</div>}
    {props.section === 'experiments' && <><div className={css.actions}><Button variant="primary" onClick={() => setForm({ kind: 'plan' })}>{t('newTrial')}</Button></div>{!state.data.trials.length && <p className={css.card}>{t('empty')}</p>}{state.data.trials.map(x => <article key={x.id} className={css.card}><div className={css.meta}><span>{t(x.status === 'draft' ? 'draft' : 'tracking')}</span><span>{x.source}</span></div><h2>{x.title}</h2><div className={css.grid}><div><h3>{t('baseline')}</h3><p>{x.baseline}</p></div><div><h3>{t('change')}</h3><p>{x.change}</p></div></div>{x.observations.length ? x.observations.map((o, i) => <p className={css.observation} key={x.id + i}>{o}</p>) : <p>{t('noObservations')}</p>}<div className={css.actions}>{x.status === 'draft' ? <><Button onClick={() => setForm({ kind: 'edit', id: x.id })}>{t('edit')}</Button><Button onClick={() => ask({ action: 'track', id: x.id }, t('track'), [[t('trialTitle'), x.title], [t('tracking'), t('trackScope')]])}>{t('track')}</Button></> : <Button onClick={() => setForm({ kind: 'observe', id: x.id })}>{t('observe')}</Button>}<Button onClick={() => setForm({ kind: 'share', id: x.id })}>{t('share')}</Button></div></article>)}</>}
    <Modal open={form !== null} onClose={() => setForm(null)} closeLabel={t('close')} title={t(form?.kind === 'plan' ? 'newTrial' : form?.kind === 'edit' ? 'edit' : form?.kind === 'observe' ? 'observe' : 'share')}>
      {state.error && <p role="alert">{state.error}</p>}{form && <form onSubmit={async e => {
        const v = values(e)
        if (form.kind === 'share') { const r = await run({ action: 'preview', id: form.id, ...v }); if (r?.preview) setPreview(r.preview) }
        else { const command = form.kind === 'plan' ? { action: 'plan', ...v, trialAreaHa: Number(v.trialAreaHa) } : { action: form.kind, id: form.id, ...v }; ask(command, t('review'), Object.entries(v).map(([k, v]) => [labels[k] ?? k, v])) }
      }}>
        {(form.kind === 'plan' || form.kind === 'edit' || form.kind === 'share') && input('title', t('trialTitle'), trial?.title ?? '')}
        {form.kind === 'plan' && <><p>{t('planScope')}</p>{input('trialAreaHa', t('trialArea'), .5, 'number', { min: .01, max: f?.areaHa ?? 0, step: 'any' })}{text('change', t('change'))}</>}
        {form.kind === 'edit' && <>{text('baseline', t('baseline'), trial?.baseline)}{text('change', t('change'), trial?.change)}</>}
        {form.kind === 'observe' && text('observation', t('observation'))}
        {form.kind === 'share' && <>{text('takeaway', t('takeaway'))}<p>{t('shareScope')}</p></>}
        <Button type="submit" variant="primary" disabled={state.busy}>{t(form.kind === 'share' ? 'preview' : 'review')}</Button>
      </form>}
    </Modal>
    <Modal open={preview !== undefined} onClose={() => setPreview(undefined)} closeLabel={t('close')} title={t('previewTitle')} footer={<Button variant="primary" disabled={state.busy} onClick={async () => { const r = await run({ action: 'publish', previewId: preview?.previewId, confirmed: true }); if (r) { setPreview(undefined); setForm(null); setCompleted(true) } }}>{t('publish')}</Button>}>
      {state.error && <p role="alert">{state.error}</p>}{preview && <><h3>{preview.summary.title}</h3><p>{preview.summary.takeaway}</p><h3>{t('baseline')}</h3><p>{preview.summary.baseline}</p><h3>{t('change')}</h3><p>{preview.summary.change}</p><p>{t('source')}: {preview.summary.source}</p><p>{t('shareScope')}</p><p>{t('localFeed')}</p></>}
    </Modal>
    <Modal open={review !== null} onClose={() => setReview(null)} closeLabel={t('close')} title={review?.title ?? t('review')} footer={<div className={css.actions}><Button onClick={() => setReview(null)}>{t('cancel')}</Button><Button variant="primary" disabled={state.busy} onClick={() => void confirm()}>{t('confirm')}</Button></div>}>
      {state.error && <p role="alert">{state.error}</p>}<dl>{review?.details.map(([label, value], i) => <div key={label + i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </Modal>
  </section>
}
