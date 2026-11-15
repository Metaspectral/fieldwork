/** Evidence and decision views use the native page slots; editing stays in focused dialogs. */
import { useState, type ReactNode, type FormEvent } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { cornCalculation } from '../../../plugins/domain.ts'
import type { FarmState } from '../../../plugins/records.ts'
import type { Face } from './controller.ts'
import { FieldContext } from './fields.tsx'
import css from './page.module.css'
type Props = PropsRuntime<'main'> & PropsLocale<'fieldwork'> & InjectFace<Face>
type Review = { command: Record<string, unknown>; description: string }
const evidence = ['farmer-reported', 'measured', 'regional', 'assumed', 'missing', 'demo'] as const
const inputLabels = { areaHa: 'area', trialAreaHa: 'trialArea', baselineSeedsPerAcre: 'baselineRate', targetPlantsPerAcre: 'targetStand', establishmentFraction: 'establishment', seedsPerBag: 'seedsPerBag', pricePerBag: 'pricePerBag', currency: 'currency' } as const
export function ResearchPage(props: Props): ReactNode {
  const { t } = props
  const state = props.useRecords(s => s)
  const [editor, setEditor] = useState<'field' | 'source' | 'corn' | 'observation' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceSearch, setSourceSearch] = useState('')
  const data = state.data
  const source = data?.sources.find(s => s.id === sourceId)
  const previous = data?.cornPlans.find(p => p.id === selected)
  const run = async (command: Record<string, unknown>) => { try { await props.perform(command); setReview(null); setEditor(null); setLocalError(null) } catch {} }
  const request = (action: string, payload: unknown, description: string) => setReview({ command: { action, payload, confirmed: true }, description })
  const field = (name: string, label: string, value: string | number = '', type = 'text', options: Record<string, string | number> = {}) => <label className={css.field}>{label}<input name={name} type={type} defaultValue={value} required maxLength={2000} {...options} /></label>
  const options = (name: string, label: string, values: { id: string; label: string }[], initial?: string) => <label className={css.field}>{label}<select name={name} aria-label={label} defaultValue={initial} required><option value="">{t('choose')}</option>{values.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLocalError(null)
    const v = Object.fromEntries(new FormData(event.currentTarget))
    try {
      if (editor === 'field') request('field', { name: v.name, areaHa: Number(v.areaHa), evidence: v.evidence, notes: [v.reason] }, `${v.name} · ${v.areaHa} ha · ${v.reason}`)
      if (editor === 'source') {
        const file = v.file as File
        if (!file.size) { request('capture-source', { title: v.title, origin: v.origin, scope: v.scope, evidence: v.evidence }, `${v.title} · ${v.origin} · ${v.scope}\n${t('captureScope')}`); return }
        if (file.size > 5 * 1024 * 1024) throw new Error(t('sourceLimit'))
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
        request('import-source', { title: v.title, origin: v.origin, scope: v.scope, evidence: v.evidence, filename: file.name, base64: btoa(binary) }, `${v.title} · ${file.name} · ${v.origin} · ${v.evidence} · ${v.scope}`)
      }
      if (editor === 'corn') {
        const selectedField = data!.fields.find(f => f.id === v.fieldId)!
        const selectedSource = data!.sources.find(s => s.id === v.sourceId)!
        const locator = String(v.locator)
        const citation = { sourceId: selectedSource.id, locator }
        const inputs = { areaHa: selectedField.areaHa!, trialAreaHa: Number(v.trialAreaHa), baselineSeedsPerAcre: Number(v.baselineSeedsPerAcre), targetPlantsPerAcre: Number(v.targetPlantsPerAcre), establishmentFraction: Number(v.establishmentFraction), seedsPerBag: Number(v.seedsPerBag), pricePerBag: Number(v.pricePerBag), currency: String(v.currency) as 'CAD' | 'USD' }
        const calculation = cornCalculation(inputs)
        request('propose-corn', { fieldId: selectedField.id, season: Number(v.season), ...(previous ? { supersedes: previous.id } : {}), baselineReason: v.reason, constraints: String(v.constraints).split('\n').map(s => s.trim()).filter(Boolean), inputs, assumptions: Object.keys(inputs).map(label => ({ label, evidence: label === 'areaHa' ? selectedField.evidence : String(v[`evidence-${label}`] ?? 'farmer-reported'), ...(v[`locator-${label}`] ? { citation: { sourceId: selectedSource.id, locator: String(v[`locator-${label}`]) } } : {}) })), citations: [citation] }, `${selectedField.name} · ${v.season}\n${v.reason}\n${v.constraints}\n${inputs.baselineSeedsPerAcre} → ${calculation.alternativeSeedsPerAcre} ${t('seedsAcre')} · ${inputs.trialAreaHa} ha\n${calculation.baseline.wholeBags} → ${calculation.trial.wholeBags} ${t('wholeBags')} · ${inputs.currency} ${calculation.baseline.purchaseCost} → ${calculation.trial.purchaseCost}\n${selectedSource.title} / ${locator}`)
      }
      if (editor === 'observation') request('observe-corn', { id: selected, date: v.date, text: v.text, evidence: v.evidence }, `${v.date} · ${v.evidence} · ${v.text}`)
    } catch (error) { setLocalError(error instanceof Error ? error.message : t('missing')) }
  }
  if (!data) return <section className={css.page}><h1>{t(props.section)}</h1><p role="status">{state.error ?? t('loading')}</p></section>
  return <section className={css.page}>
    <header className={css.header}><div><p className={css.brandLine}>{t('brandLine')}</p><h1>{t(props.section)}</h1><p>{t(props.section === 'library' ? 'libraryIntro' : 'cornIntro')}</p></div><Button onClick={() => { setSelected(null); setEditor(props.section === 'library' ? 'source' : 'corn') }} disabled={state.busy || props.section === 'corn' && (!data.fields.some(f => f.areaHa) || !data.sources.length)}>{t(props.section === 'library' ? 'importSource' : 'newCornPlan')}</Button></header>
    <div className={css.status}><span>{t('local')}</span><span>{t('private')}</span></div>
    {state.error && <p role="alert">{state.error}</p>}
    {state.saved && <p role="status">{t('saved')}</p>}
    {props.section === 'library' ? <>
      <label className={css.field}>{t('searchEvidence')}<input value={search} onChange={e => setSearch(e.target.value)} /></label>
      {!data.sources.length && <section className={css.card}><h2>{t('keepYourTools')}</h2><p>{t('sourceEmpty')}</p></section>}
      {data.sources.filter(s => `${s.title} ${s.origin} ${s.scope}`.toLowerCase().includes(search.toLowerCase())).map(s => <article className={css.card} key={s.id}>
        <div className={css.meta}><span>{s.kind} · {s.evidence}</span><time>{new Date(s.capturedAt).toLocaleDateString()}</time></div>
        <h2>{s.title}</h2><p>{s.origin}</p><p>{s.scope}</p><div className={css.actions}><Button onClick={() => { setSourceId(s.id); setSourceSearch('') }}>{t('inspectEvidence')}</Button>{s.originalFile && <a className={css.downloadLink} href={new URL(`fieldwork-original?id=${encodeURIComponent(s.id)}`, document.baseURI).href} download>{t('downloadOriginal')}</a>}</div><small>SHA-256 {s.sha256}</small>
      </article>)}
    </> : <>
      <FieldContext fields={data.fields} t={t} action={<Button onClick={() => setEditor('field')}>{t('addField')}</Button>} />
      {!data.sources.length && <p>{t('cornNeedsSources')}</p>}
      {!data.cornPlans.length && <section className={css.card}><h2>{t('learnFromBaseline')}</h2><p>{t('cornEmpty')}</p><Button onClick={() => request('corn-demo', {}, t('cornDemoScope'))}>{t('loadCornDemo')}</Button></section>}
      {data.cornPlans.toReversed().map(p => <CornDecision key={p.id} plan={p} data={data} t={t} busy={state.busy} accept={() => request('accept-corn', { id: p.id }, `${t('acceptCornScope')}\n${p.baselineReason}\n${p.constraints.join('\n')}\n${JSON.stringify(p.inputs)}\n${p.citations.map(c => `${c.sourceId} / ${c.locator}`).join('\n')}`)} revise={() => { setSelected(p.id); setEditor('corn') }} observe={() => { setSelected(p.id); setEditor('observation') }} source={id => { setSourceId(id); setSourceSearch('') }} />)}
    </>}
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={editor !== null} onClose={() => setEditor(null)} closeLabel={t('close')} title={t(editor === 'field' ? 'addField' : editor === 'source' ? 'importSource' : editor === 'observation' ? 'observe' : 'newCornPlan')}>
      {localError && <p role="alert">{localError}</p>}<form onSubmit={e => void submit(e)}>
      {editor === 'field' && <>{field('name', t('fieldName'))}{field('areaHa', t('area'), '', 'number', { min: .0001, step: 'any' })}{options('evidence', t('evidence'), ['farmer-reported', 'measured', 'demo'].map(id => ({ id, label: id })), 'farmer-reported')}{field('reason', t('reason'))}</>}
      {editor === 'source' && <>{field('title', t('sourceTitle'))}{field('origin', t('sourceOrigin'))}{field('scope', t('sourceScope'))}{options('evidence', t('evidence'), evidence.map(id => ({ id, label: id })), 'farmer-reported')}<label className={css.field}>{t('originalDocument')}<input type="file" name="file" accept=".xlsx,.xls,.csv,.ods,.pdf,.html,.htm,.txt,.md" /></label><p>{t('sourceLimit')}</p><p>{t('captureScope')}</p></>}
      {editor === 'corn' && <>
        {options('fieldId', t('fieldName'), data.fields.filter(f => f.areaHa).map(f => ({ id: f.id, label: `${f.name} · ${f.areaHa} ha · ${f.evidence}` })), previous?.fieldId)}
        {field('season', t('season'), previous?.season ?? new Date().getFullYear() + 1, 'number', { min: 1900, max: 2200 })}
        {field('reason', t('reason'), previous?.baselineReason ?? data.farm.reason)}
        <label className={css.field}>{t('constraints')}<textarea name="constraints" defaultValue={previous?.constraints.join('\n')} required maxLength={2000} /></label>
        <p>{t('cornInputScope')}</p>
        <div className={css.grid}>{Object.entries(inputLabels).filter(([key]) => !['areaHa', 'currency'].includes(key)).map(([key, label]) => <div key={key}>{field(key, t(label), previous?.inputs[key as keyof typeof previous.inputs] ?? '', 'number', { min: key === 'pricePerBag' ? 0 : .0001, ...(key === 'establishmentFraction' ? { max: 1 } : {}), step: key === 'pricePerBag' ? '.01' : 'any' })}{options(`evidence-${key}`, t('evidence'), evidence.map(id => ({ id, label: id })), previous?.assumptions.find(a => a.label === key)?.evidence ?? 'farmer-reported')}<label className={css.field}>{t('inputCitation')}<input name={`locator-${key}`} defaultValue={previous?.assumptions.find(a => a.label === key)?.citation?.locator ?? ''} /></label></div>)}</div>
        {options('currency', t('currency'), ['CAD', 'USD'].map(id => ({ id, label: id })), previous?.inputs.currency ?? 'CAD')}
        {options('sourceId', t('sourceTitle'), data.sources.map(s => ({ id: s.id, label: `${s.title} · ${s.evidence}` })), previous?.citations[0]?.sourceId)}
        <label className={css.field}>{t('areaCitation')}<input name="locator-areaHa" defaultValue={previous?.assumptions.find(a => a.label === 'areaHa')?.citation?.locator ?? ''} /></label>{field('locator', t('citationLocator'), previous?.citations[0]?.locator ?? '')}<p>{t('citationHint')}</p>
      </>}
      {editor === 'observation' && <>{field('date', t('date'), new Date().toLocaleDateString('en-CA'), 'date')}{field('text', t('observation'))}{options('evidence', t('evidence'), ['farmer-reported', 'measured', 'demo'].map(id => ({ id, label: id })), 'farmer-reported')}</>}
      <Button type="submit" disabled={state.busy}>{t('review')}</Button></form>
    </Modal>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={review !== null} onClose={() => setReview(null)} closeLabel={t('close')} title={t('review')} footer={<Button disabled={state.busy} onClick={() => review && void run(review.command)}>{t('confirm')}</Button>}>
      {state.error && <p role="alert">{state.error}</p>}<p className={css.preserveLines}>{review?.description}</p>
    </Modal>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={source !== undefined} onClose={() => setSourceId(null)} closeLabel={t('close')} title={source?.title ?? t('source')}>
      <p>{source?.scope} · {source?.evidence}</p><p>{source?.origin}</p><label className={css.field}>{t('searchEvidence')}<input value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} /></label>
      {source?.sections.filter(s => `${s.locator} ${s.text}`.toLowerCase().includes(sourceSearch.toLowerCase())).slice(0, 100).map(s => <div className={css.observation} key={s.locator}><strong>{s.locator}</strong><SourceSection text={s.text} spreadsheet={source.kind === 'spreadsheet'} t={t} /><small>{source.id} / {s.locator}</small></div>)}<p>{t('sourcePageLimit')}</p>
    </Modal>
  </section>
}
function CornDecision({ plan: p, data, t, busy, accept, revise, observe, source }: { plan: FarmState['cornPlans'][number]; data: FarmState; t: Props['t']; busy: boolean; accept(): void; revise(): void; observe(): void; source(id: string): void }): ReactNode {
  const result = p.calculation
  return <article className={css.card}>
    <div className={css.meta}><span>{p.season} · {t('revision')} {p.revision} · {p.status}</span><span>{data.fields.find(f => f.id === p.fieldId)?.name}</span></div>
    <h2>{t('baselineToLearning')}</h2><p>{p.baselineReason}</p><div className={css.grid}><div><h3>{t('baseline')}</h3><p>{p.inputs.baselineSeedsPerAcre.toLocaleString()} {t('seedsAcre')}</p><p>{p.inputs.areaHa - p.inputs.trialAreaHa} ha {t('retainingBaseline')}</p></div><div><h3>{t('change')}</h3><p>{result.alternativeSeedsPerAcre.toLocaleString()} {t('seedsAcre')} · {p.inputs.trialAreaHa} ha</p><p>{p.inputs.targetPlantsPerAcre.toLocaleString()} {t('plantsAcre')} ÷ {p.inputs.establishmentFraction}</p></div></div>
    <div className={css.tableScroll}><table className={css.comparisonTable}><caption>{t('purchaseBudget')}</caption><thead><tr><th>{t('scenario')}</th><th>{t('wholeBags')}</th><th>{t('purchaseCost')}</th><th>{t('leftoverSeeds')}</th></tr></thead><tbody>{[[t('baseline'), result.baseline], [t('trialAndBaseline'), result.trial]].map(([label, value]) => { const b = value as typeof result.baseline; return <tr key={String(label)}><th>{String(label)}</th><td>{b.wholeBags}</td><td>{result.currency} {b.purchaseCost.toFixed(2)}</td><td>{b.leftoverSeeds.toLocaleString()}</td></tr> })}</tbody></table></div>
    <p>{t('budgetLimits')}</p><h3>{t('planConstraints')}</h3><ul>{p.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
    <details><summary>{t('inputsAndEvidence')}</summary><dl>{p.assumptions.map((a, i) => <div key={i}><dt>{inputLabels[a.label as keyof typeof inputLabels] ? t(inputLabels[a.label as keyof typeof inputLabels]) : a.label}</dt><dd>{String(p.inputs[a.label as keyof typeof p.inputs])} · {a.evidence}{a.citation && <> · {a.citation.locator}</>}</dd></div>)}</dl></details>
    <div className={css.actions}>{p.citations.map((c, i) => <Button key={i} onClick={() => source(c.sourceId)}>{data.sources.find(s => s.id === c.sourceId)?.title} · {c.locator}</Button>)}</div>
    <div className={css.actions}>{p.status === 'proposed' ? <Button disabled={busy} onClick={accept}>{t('acceptCorn')}</Button> : <Button disabled={busy} onClick={observe}>{t('observe')}</Button>}<Button disabled={busy} onClick={revise}>{t('newRevision')}</Button></div>
    <h3>{t('learningRecord')}</h3>{p.observations.length ? <ol>{p.observations.map(o => <li key={o.id}><p>{o.date} · {o.evidence}</p><p>{o.text}</p></li>)}</ol> : <p>{t('noObservations')}</p>}
  </article>
}

function SourceSection({ text, spreadsheet, t }: { text: string; spreadsheet: boolean; t: Props['t'] }): ReactNode {
  if (!spreadsheet) return <p className={css.preserveLines}>{text}</p>
  let cell: { value?: unknown; formula?: unknown; calculation?: unknown }
  try { cell = JSON.parse(text) } catch { return <p>{text}</p> }
  if (!cell || typeof cell !== 'object') return <p>{text}</p>
  return <dl><dt>{t('cellValue')}</dt><dd>{cell.value === null || cell.value === undefined ? '—' : String(cell.value)}</dd>{typeof cell.formula === 'string' && <><dt>{t('cellFormula')}</dt><dd><code>={cell.formula}</code></dd><p>{t('cachedFormula')}</p></>}</dl>
}
