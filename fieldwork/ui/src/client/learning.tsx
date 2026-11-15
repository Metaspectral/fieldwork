/** Native field-learning workspace: discover a method, inspect observations, and retain decisions. */
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { Face } from './controller.ts'
import type { LearningSnapshot, MethodCard, MonitorCheck, SceneObservation } from '../../../plugins/learning-types.ts'
import { parseHarvestCsv } from '../../../plugins/learning-calculations.ts'
import { Investigations } from './investigations.tsx'
import { FieldSeasonContext } from './context.tsx'
import { FarmMarkdown } from './markdown.tsx'
import shared from './page.module.css'
import css from './learning.module.css'
type Props = PropsRuntime<'main'> & PropsLocale<'fieldwork'> & InjectFace<Face>
type Review = { action: string; payload: unknown; title: string; details: string }
const statuses = { running: 'checkRunning', available: 'checkAvailable', 'no-new-data': 'checkNoNew', 'no-usable-data': 'checkUnusable', 'provider-error': 'checkFailed', interrupted: 'checkInterrupted' } as const
/** Render through injected native state; this component owns only its unsaved drafts. */
export function LearningPage(props: Props): ReactNode {
  const { t } = props, view = props.useRecords(s => s), data = view.learning, farm = view.data
  const formId = useId()
  const [selected, setSelected] = useState<string | null>(null)
  const [method, setMethod] = useState<MethodCard | null>(null)
  const [editor, setEditor] = useState<'field' | 'monitor' | 'scout' | 'trial' | 'outcome' | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [investigationStart, setInvestigationStart] = useState(0)
  const investigation = data?.investigations.find(i => i.id === link)
  const matchingMonitors = data?.monitors.filter(m => !view.selection.fieldId || m.fieldId === view.selection.fieldId) ?? []
  const monitor = matchingMonitors.find(m => m.id === selected) ?? matchingMonitors.at(-1)
  const checks = data?.checks.filter(c => c.monitorId === monitor?.id).toReversed() ?? []
  const latestCheck = checks[0]
  const observed = checks.flatMap(c => c.scenes.map(scene => ({ check: c, scene })))
  const latest = observed.find(o => o.scene.qualified) ?? observed[0]
  const linkedCheck = data?.checks.find(c => c.id === link)
  const checkField = data?.monitors.find(m => m.id === linkedCheck?.monitorId)?.fieldId
  const scout = data?.scouts.find(s => s.id === link)
  const trial = data?.trials.find(s => s.id === link)
  const run = async (action: string, payload: unknown) => {
    try { const r = await props.perform({ action, payload, confirmed: true }); setReview(null); setEditor(null); setError(null); if (r.createdId && action === 'field') props.selectContext({ fieldId: r.createdId, investigationId: null }); if (r.createdId && ['learning/demo', 'learning/enable'].includes(action)) { setSelected(r.createdId); const m = r.learning.monitors.find(m => m.id === r.createdId); if (m) props.selectContext({ fieldId: m.fieldId, investigationId: null }) }; return r }
    catch (error) { setError(error instanceof Error ? error.message : t('learningFailed')); return undefined }
  }
  const ask = (action: string, payload: unknown, title: string, details: string) => setReview({ action, payload, title, details })
  const input = (name: string, label: string, value: string | number = '', type = 'text', extra: Record<string, string | number> = {}) => <label className={shared.field}>{label}<input name={name} type={type} defaultValue={value} required maxLength={4000} {...extra} /></label>
  const area = (name: string, label: string, value = '', required = true) => <div className={shared.field}><label htmlFor={`${formId}-${name}`}>{label}</label><textarea id={`${formId}-${name}`} name={name} defaultValue={value} required={required} maxLength={100000} /></div>
  const choice = (name: string, label: string, options: { id: string; label: string }[], value?: string) => <label className={shared.field}>{label}<select name={name} aria-label={label} defaultValue={value} required><option value="">{t('choose')}</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
  const files = (ids: string[]) => <FileLinks ids={ids} data={data!} t={t} />
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    const v = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    try {
      if (editor === 'field') ask('field', { name: v.name, areaHa: Number(v.areaHa), evidence: 'farmer-reported', notes: [v.reason] }, t('addField'), `${v.name} · ${v.areaHa} ha\n${v.reason}`)
      if (editor === 'monitor') {
        const payload = { fieldId: v.fieldId, ...(v.boundary?.trim() ? { boundary: JSON.parse(v.boundary) } : {}), ...(v.boundarySourceId ? { boundarySourceId: v.boundarySourceId } : {}), question: v.question, mode: 'live', minUsableFraction: Number(v.minUsableFraction), minValidPixels: Number(v.minValidPixels), lookbackDays: Number(v.lookbackDays) }
        ask('learning/enable', payload, t('enableWeekly'), `${t('liveMonitorReview')}\n${v.question}\n${v.boundary}\n${t('usableFraction')}: ${v.minUsableFraction}; ${t('minimumPixels')}: ${v.minValidPixels}; ${t('lookback')}: ${v.lookbackDays}`)
      }
      if (editor === 'scout') {
        const payload = { fieldId: v.fieldId, question: v.question, notes: v.notes, ...(link && data!.checks.some(c => c.id === link) ? { checkId: link } : {}) }
        ask('learning/scout', payload, t('saveScouting'), `${v.question}\n\n${v.notes}`)
      }
      if (editor === 'trial') {
        const payload = { fieldId: v.fieldId, ...(investigation ? { investigationId: investigation.id } : {}), ...(scout ? { scoutId: scout.id } : trial?.scoutId ? { scoutId: trial.scoutId } : {}), ...(trial ? { previousTrialId: trial.id } : {}), sourceIds: [...new Set([...(investigation?.evidence.map(e => e.sourceId) ?? []), ...(v.sourceId ? [v.sourceId] : [])])], question: v.question, baseline: v.baseline, alternative: v.alternative, constraints: v.constraints, measurements: v.measurements, design: v.design, replicates: Number(v.replicates), ...(v.cornPlanId ? { cornPlanId: v.cornPlanId } : {}) }
        ask('learning/trial', payload, t('draftComparison'), `${v.question}\n${t('baseline')}: ${v.baseline}\n${t('alternativePractice')}: ${v.alternative}\n${v.constraints}\n${v.measurements}\n${v.design} · ${v.replicates} ${t('blocks')}\n${t('schematicLimits')}`)
      }
      if (editor === 'outcome') {
        const rows = parseHarvestCsv(v.csv!)
        const difference = rows.length ? rows.reduce((s, r) => s + r.alternativeYield - r.baselineYield, 0) / rows.length : null
        ask('learning/outcome', { id: link, ...v }, t('saveLearning'), `${rows.length}/${trial?.replicates} ${t('blocks')}\n${t('meanDifference')}: ${difference === null ? t('noHarvestData') : difference.toFixed(3)} ${v.unit}\n${t('descriptiveOnly')}\n\n${v.interpretation}\n\n${v.farmerDecision}`)
      }
    } catch (error) { setError(error instanceof Error ? error.message : t('learningFailed')) }
  }
  if (!data || !farm) return <section className={shared.page}><h1>{t('learning')}</h1><p role="status">{view.error ?? t('loading')}</p><Button onClick={() => void props.refresh()}>{t('retry')}</Button></section>
  const selectedField = farm.fields.find(f => f.id === monitor?.fieldId)
  const score = (m: MethodCard) => question.toLowerCase().split(/\s+/).filter(w => w.length > 2 && `${m.question} ${m.title} ${m.stage} ${m.needs.join(' ')}`.toLowerCase().includes(w)).length
  const matchingMethods = data.methods.toSorted((a, b) => score(b) - score(a))
  return <section className={`${shared.page} ${css.root}`}>
    <header className={shared.header}><div><p className={shared.brandLine}>{t('brandLine')}</p><h1>{t('learning')}</h1><p>{t('learningIntro')}</p></div><Button variant="outline" onClick={() => { setLink(null); setEditor(farm.fields.some(f => f.evidence !== 'demo') ? 'monitor' : 'field') }} disabled={view.busy}>{t(farm.fields.some(f => f.evidence !== 'demo') ? 'watchMyField' : 'addMyField')}</Button></header>
    <FieldSeasonContext data={farm} selection={view.selection} select={props.selectContext} t={t} />
    <Investigations {...props} startSignal={investigationStart} startTrial={i => { setLink(i.id); setEditor('trial') }} />
    <nav className={css.journey} aria-label={t('learningCycle')}><span>{t('observeStage')}</span><span>{t('investigateStage')}</span><span>{t('compareStage')}</span><span>{t('decideStage')}</span></nav>
    {data.storageError && <p role="alert" className={shared.error}>{data.storageError}</p>}
    {(error || view.error) && <p role="alert" className={shared.error}>{error ?? view.error}</p>}
    {view.saved && <p role="status" className={shared.notice}>{t('saved')}</p>}
    <details className={css.discovery} open={!monitor && !data.investigations.length}>
      <summary>{t('findAMethod')}</summary><p>{t('discoveryIntro')}</p><label className={shared.field}>{t('questionSearch')}<input value={question} onChange={e => setQuestion(e.target.value)} /></label>
      <div className={css.methodGrid}>{matchingMethods.map(m => <article className={css.methodCard} key={m.id}><p className={css.eyebrow}>{t(m.stage === 'observe' ? 'observeStage' : m.stage === 'investigate' ? 'investigateStage' : 'compareStage')}</p><h2>{m.title}</h2><p>{m.question}</p><p className={css.muted}>{m.effort}</p><details><summary>{t('fitAndLimits')}</summary><ul>{m.needs.map(n => <li key={n}>{n}</li>)}</ul><p>{m.limits}</p></details><div className={shared.actions}><Button onClick={() => setMethod(m)}>{t('readMethod')}</Button><Button disabled={view.busy || !farm.fields.length || m.id === 'watch-field' && !farm.fields.some(f => f.evidence !== 'demo')} onClick={() => { setLink(null); m.id === 'historical-yield' ? setInvestigationStart(n => n + 1) : setEditor(m.id === 'watch-field' ? 'monitor' : m.id === 'scout-pattern' ? 'scout' : 'trial') }}>{t('useMethod')}</Button></div></article>)}</div>
    </details>
    {!monitor && <section className={css.empty}><div><p className={css.eyebrow}>{t('startWithQuestion')}</p><h2>{t('demoJourney')}</h2><p>{t('demoJourneyScope')}</p></div><Button variant="primary" disabled={view.busy} onClick={() => ask('learning/demo', {}, t('loadLearningDemo'), t('demoJourneyScope'))}>{t('loadLearningDemo')}</Button></section>}
    {monitor && <>
      <section className={css.monitorHeader}><div><p className={css.eyebrow}>{monitor.mode === 'demo' ? t('fictionalMonitor') : t('sentinelMonitor')}</p><h2>{selectedField?.name}</h2><p>{monitor.question}</p></div><div className={css.monitorControls}>
        {data.monitors.length > 1 && <label className={shared.field}>{t('selectMonitor')}<select aria-label={t('selectMonitor')} value={monitor.id} onChange={e => setSelected(e.target.value)}>{matchingMonitors.map(m => <option key={m.id} value={m.id}>{farm.fields.find(f => f.id === m.fieldId)?.name}</option>)}</select></label>}
        <div className={shared.actions}><Button variant="primary" disabled={view.busy || latestCheck?.status === 'running'} onClick={() => void run('learning/check', { id: monitor.id })}>{latestCheck?.status === 'running' ? t('checkingData') : t('checkNow')}</Button><Button disabled={view.busy} onClick={() => ask('learning/active', { id: monitor.id, active: !monitor.active }, monitor.active ? t('pauseMonitor') : t('resumeMonitor'), monitor.active ? t('pauseMonitorScope') : t('liveMonitorReview'))}>{monitor.active ? t('pauseMonitor') : t('resumeMonitor')}</Button></div>
      </div></section>
      <div className={css.scheduleLine}><span>{monitor.active ? t('weeklyActive') : t('monitorPaused')}</span><span>{t('nextCheck')}: {monitor.active ? new Date(monitor.nextCheckAt).toLocaleString() : '—'}</span><span>{t('runtimeRequired')}</span></div>
      {files([monitor.methodArtifactId, monitor.boundaryArtifactId])}
      <div className={css.observationGrid}>
        <section className={css.visualCard}><div className={css.cardHeading}><h2>{t('fieldObservation')}</h2><span>{latest ? new Date(latest.scene.acquiredAt).toLocaleDateString() : t('awaitingCheck')}</span></div>
          {latest?.scene.grid ? <><FieldRaster scene={latest.scene} label={t('ndviMap')} /><div className={css.legend}><span>{t('lessGreen')}</span><span className={css.gradient} /><span>{t('moreGreen')}</span><span>{t('maskedPixels')}</span></div><div className={css.metrics}><div><span>{t('usableCoverage')}</span><strong>{(latest.scene.usableFraction * 100).toFixed(0)}%</strong></div><div><span>{t('meanNdvi')}</span><strong>{latest.scene.meanNdvi?.toFixed(3) ?? '—'}</strong></div><div><span>{t('validPixels')}</span><strong>{latest.scene.validPixels.toLocaleString()}</strong></div></div>{!latest.scene.qualified && <p role="status">{t('unqualifiedScene')}</p>}<p className={css.muted}>{t('imageryInterpretation')}</p>{monitor.mode === 'live' && <p className={css.muted}>{t('satelliteAttribution')} ({latest.scene.acquiredAt.slice(0, 4)})</p>}<div className={shared.actions}><Button onClick={() => { setLink(latest.check.id); setEditor('scout') }}>{t('investigateObservation')}</Button></div>{files(latest.scene.artifactIds)}</> : <div className={css.noImage}><p>{t('noObservationYet')}</p><p>{t('checkAvailabilityScope')}</p></div>}
        </section>
        <section className={css.historyCard}><h2>{t('dataCheckHistory')}</h2><p className={css.muted}>{t('historyScope')}</p>{!checks.length && <p>{t('noChecksYet')}</p>}<ol className={css.checkList}>{checks.slice(0, 8).map(c => <li key={c.id}><span className={`${css.statusDot} ${c.status === 'available' ? css.available : ''}`} /><div><strong>{t(statuses[c.status])}</strong><time>{new Date(c.startedAt).toLocaleString()}</time><p>{c.catalogCount} {t('catalogScenes')} · {c.scenes.filter(s => s.qualified).length} {t('usableScenes')}</p>{c.error && <p role="status">{c.error.message}</p>}{c.catalogLimited && <p>{t('boundedSearch')}</p>}{files(c.artifactIds.filter(id => data.artifacts.find(a => a.id === id)?.filename === 'check.json'))}</div></li>)}</ol></section>
      </div>
      <section className={css.trendCard}><h2>{t('observationHistory')}</h2><ObservationTrend checks={checks} label={t('ndviTrend')} /><p className={css.muted}>{t('trendScope')}</p></section>
    </>}
    <section className={css.learningRecords}><div className={shared.header}><div><p className={css.eyebrow}>{t('groundedLearning')}</p><h2>{t('scoutingAndQuestions')}</h2></div><Button disabled={!farm.fields.length || view.busy} onClick={() => { setLink(null); setEditor('scout') }}>{t('newScouting')}</Button></div>
      {!data.scouts.length && <p className={css.muted}>{t('scoutingEmpty')}</p>}
      {data.scouts.filter(s => !view.selection.fieldId || s.fieldId === view.selection.fieldId).toReversed().map(s => <article className={css.noteCard} key={s.id}><div className={shared.meta}><span>{farm.fields.find(f => f.id === s.fieldId)?.name}</span><time>{new Date(s.createdAt).toLocaleDateString()}</time></div><h3>{s.question}</h3><FarmMarkdown text={s.notes} t={t} />{files(s.artifactIds)}<Button onClick={() => { setLink(s.id); setEditor('trial') }}>{t('turnIntoComparison')}</Button></article>)}
    </section>
    <section className={css.learningRecords}><div className={shared.header}><div><p className={css.eyebrow}>{t('oneChange')}</p><h2>{t('fieldComparisons')}</h2></div><Button disabled={!farm.fields.length || view.busy} onClick={() => { setLink(null); setEditor('trial') }}>{t('draftComparison')}</Button></div>
      {!data.trials.length && <p className={css.muted}>{t('comparisonEmpty')}</p>}
      {data.trials.filter(s => !view.selection.fieldId || s.fieldId === view.selection.fieldId).toReversed().map(trial => <article className={css.trialCard} key={trial.id}>{trial.previousTrialId && <p className={css.muted}>{t('followUpRecord')}</p>}<div className={shared.meta}><span>{farm.fields.find(f => f.id === trial.fieldId)?.name} · {trial.design === 'exploratory' ? t('exploratoryDesign') : t('randomizedDesign')}</span><span>{t(trial.status === 'draft' ? 'draft' : trial.status === 'tracking' ? 'tracking' : 'reviewedLearning')}</span></div><h2>{trial.question}</h2><div className={shared.grid}><div><h3>{t('baseline')}</h3><p>{trial.baseline}</p></div><div><h3>{t('alternativePractice')}</h3><p>{trial.alternative}</p></div></div><p>{trial.constraints}</p><p>{trial.measurements}</p><div className={css.blocks}>{trial.layout.map(b => <div key={b.block}><span>{t('block')} {b.block}</span><div><span className={b.first === 'baseline' ? css.baselineStrip : css.alternativeStrip}>{t(b.first === 'baseline' ? 'baseline' : 'alternativePractice')}</span><span className={b.first === 'baseline' ? css.alternativeStrip : css.baselineStrip}>{t(b.first === 'baseline' ? 'alternativePractice' : 'baseline')}</span></div></div>)}</div><p className={css.muted}>{t('schematicLimits')}</p>
        {trial.results && <><YieldComparison results={trial.results} t={t} /><p>{trial.results.rows.length}/{trial.replicates} {t('blocksMeasured')} · {trial.results.complete ? t('allBlocksPresent') : t('missingBlocksVisible')}</p><p className={css.muted}>{t('descriptiveOnly')}</p><h3>{t('interpretation')}</h3><p>{trial.results.interpretation}</p><h3>{t('farmerDecision')}</h3><p>{trial.results.farmerDecision}</p></>}
        {files(trial.artifactIds)}<div className={shared.actions}>{trial.status === 'draft' && <Button disabled={view.busy} onClick={() => ask('learning/start', { id: trial.id }, t('startComparison'), `${trial.question}\n${trial.baseline}\n${trial.alternative}\n${trial.constraints}\n${trial.measurements}\n${trial.replicates} ${t('blocks')}\n${t('schematicLimits')}`)}>{t('startComparison')}</Button>}{trial.status === 'reviewed' && <Button onClick={() => { setLink(trial.id); setEditor('trial') }}>{t('planFollowUp')}</Button>}{trial.status === 'tracking' && <Button onClick={() => { setLink(trial.id); setEditor('outcome') }}>{t('recordLearning')}</Button>}</div>
      </article>)}
    </section>
    <details className={css.workspace}><summary>{t('filesAndMethods')}</summary><p>{t('workspaceScope')}</p><code>{data.workspace}</code><ul>{data.methods.map(m => <li key={m.id}><Button onClick={() => setMethod(m)}>{m.title} · v{m.version}</Button><code>methods/{m.id}/v1/SKILL.md</code></li>)}</ul></details>
    <Modal className={shared.researchModal!} contentClassName={shared.researchModalContent!} open={editor !== null} onClose={() => setEditor(null)} closeLabel={t('close')} title={t(editor === 'field' ? 'addField' : editor === 'monitor' ? 'watchMyField' : editor === 'scout' ? 'newScouting' : editor === 'outcome' ? 'recordLearning' : 'draftComparison')}>
      {error && <p role="alert">{error}</p>}<form id={formId} onSubmit={e => void submit(e)}>
        {editor !== 'outcome' && editor !== 'field' && choice('fieldId', t('fieldName'), farm.fields.filter(f => editor !== 'monitor' || f.evidence !== 'demo').map(f => ({ id: f.id, label: f.name })), investigation?.fieldId ?? scout?.fieldId ?? trial?.fieldId ?? checkField ?? view.selection.fieldId ?? monitor?.fieldId)}
        {editor === 'field' && <>{input('name', t('fieldName'))}{input('areaHa', t('area'), '', 'number', { min: .0001, max: 100000, step: 'any' })}{area('reason', t('reason'))}</>}
        {editor === 'monitor' && <>{area('question', t('farmerQuestion'))}<label className={shared.field}>{t('boundarySource')}<select name="boundarySourceId" aria-label={t('boundarySource')}><option value="">{t('noneSelected')}</option>{farm.sources.filter(s => /\.(geo)?json$/i.test(s.filename ?? '')).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>{area('boundary', t('fieldBoundaryGeoJSON'), '', false)}<p>{t('boundaryScope')}</p><details><summary>{t('qualitySettings')}</summary>{input('minUsableFraction', t('usableFraction'), .6, 'number', { min: .1, max: 1, step: '.05' })}{input('minValidPixels', t('minimumPixels'), 16, 'number', { min: 4, max: 100000, step: 1 })}{input('lookbackDays', t('lookback'), 30, 'number', { min: 7, max: 90, step: 1 })}</details><p>{t('liveMonitorReview')}</p></>}
        {editor === 'scout' && <>{area('question', t('farmerQuestion'), monitor?.question ?? '')}{area('notes', t('scoutingNotes'))}<p>{t('scoutingNotesScope')}</p></>}
        {editor === 'trial' && <>{area('question', t('farmerQuestion'), investigation?.question ?? scout?.question ?? trial?.question ?? '')}{area('baseline', t('baseline'), investigation?.baseline ?? trial?.baseline ?? farm.farm.approach)}{area('alternative', t('alternativePractice'), trial?.alternative ?? '')}{area('constraints', t('planConstraints'), trial?.constraints ?? farm.farm.reason)}{area('measurements', t('measurementPlan'), trial?.measurements ?? '')}{choice('design', t('comparisonDesign'), [{ id: 'exploratory', label: t('exploratoryDesign') }, { id: 'randomized-block', label: t('randomizedDesign') }], 'exploratory')}{input('replicates', t('numberOfBlocks'), 1, 'number', { min: 1, max: 12, step: 1 })}<label className={shared.field}>{t('supportingSource')}<select name="sourceId" aria-label={t('supportingSource')}><option value="">{t('noneSelected')}</option>{farm.sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label className={shared.field}>{t('linkedCornPlan')}<select name="cornPlanId" aria-label={t('linkedCornPlan')}><option value="">{t('noneSelected')}</option>{farm.cornPlans.filter(p => p.status === 'accepted').map(p => <option key={p.id} value={p.id}>{p.season} · {t('revision')} {p.revision}</option>)}</select></label><p>{t('schematicLimits')}</p></>}
        {editor === 'outcome' && <>{choice('unit', t('yieldUnit'), ['kg/ha', 't/ha'].map(id => ({ id, label: id })), 't/ha')}{area('csv', t('pairedHarvest'), 'block,baselineYield,alternativeYield\n' + (trial?.layout.map(b => `${b.block},,`).join('\n') ?? ''))}<p>{t('harvestScope')}</p>{area('interpretation', t('interpretation'))}{area('farmerDecision', t('farmerDecision'))}</>}
        <Button type="submit" variant="primary" disabled={view.busy}>{t('review')}</Button>
      </form>
    </Modal>
    <Modal className={shared.researchModal!} contentClassName={shared.researchModalContent!} open={review !== null} onClose={() => setReview(null)} closeLabel={t('close')} title={review?.title ?? t('review')} footer={<div className={shared.actions}><Button onClick={() => setReview(null)}>{t('cancel')}</Button><Button variant="primary" disabled={view.busy} onClick={() => review && void run(review.action, review.payload)}>{t('confirm')}</Button></div>}>
      {data.storageError && <p role="alert" className={shared.error}>{data.storageError}</p>}
    {(error || view.error) && <p role="alert">{error ?? view.error}</p>}<p className={shared.preserveLines}>{review?.details}</p>
    </Modal>
    <Modal className={shared.researchModal!} contentClassName={shared.researchModalContent!} open={method !== null} onClose={() => setMethod(null)} closeLabel={t('close')} title={method ? method.title : t('readMethod')}>
      <p>{method?.limits}</p>{method && <><FarmMarkdown text={method.instructions.replace(/^---[\s\S]*?---\s*/, '')} t={t} /><details><summary>{t('methodTechnical')}</summary><pre className={css.instructions}>{method.instructions}</pre></details></>}<ul>{method?.sources.map(s => <li key={s.url}><a className={shared.downloadLink} href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
    </Modal>
  </section>
}
function FileLinks({ ids, data, t }: { ids: string[]; data: LearningSnapshot; t: Props['t'] }): ReactNode {
  return <details className={css.fileLinks}><summary>{t('savedFiles')} ({ids.length})</summary><ul>{ids.map(id => { const file = data.artifacts.find(f => f.id === id); return file ? <li key={id}><a className={shared.downloadLink} href={new URL(`fieldwork-learning-file?id=${encodeURIComponent(id)}`, document.baseURI).href} download>{file.filename}</a><small> · {file.sha256.slice(0, 12)}</small></li> : null })}</ul></details>
}
function FieldRaster({ scene, label }: { scene: SceneObservation; label: string }): ReactNode {
  const id = useId(), grid = scene.grid!
  const color = (n: number) => n < .15 ? '#ad9576' : n < .3 ? '#c5bb81' : n < .45 ? '#b5c27e' : n < .6 ? '#83a868' : n < .75 ? '#4f8356' : '#28543b'
  return <svg className={css.raster} viewBox={`0 0 ${grid.width} ${grid.height}`} role="img" aria-label={label} shapeRendering="crispEdges"><defs><pattern id={id} patternUnits="userSpaceOnUse" width="3" height="3"><rect width="3" height="3" fill="var(--dsw-alias-bg-layer-2)" /><path d="M0 3L3 0" stroke="var(--dsw-alias-border-l3)" strokeWidth=".3" /></pattern></defs><rect width={grid.width} height={grid.height} fill={`url(#${id})`} />{grid.values.map((n, i) => n === null ? null : <rect key={i} x={i % grid.width} y={Math.floor(i / grid.width)} width="1" height="1" fill={color(n)} />)}</svg>
}
function ObservationTrend({ checks, label }: { checks: MonitorCheck[]; label: string }): ReactNode {
  const points = checks.flatMap(c => c.scenes).filter(s => s.qualified && s.meanNdvi !== null).sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt))
  const first = Date.parse(points[0]?.acquiredAt ?? ''), last = Date.parse(points.at(-1)?.acquiredAt ?? '')
  return <svg className={css.trend} viewBox="0 0 900 180" role="img" aria-label={label}><path d="M45 15V140H870M45 77H870" fill="none" stroke="var(--dsw-alias-border-l3)" />{[-1, 0, 1].map(n => <text key={n} x="10" y={80 - n * 60} fill="currentColor" fontSize="12">{n}</text>)}{points.map(p => <circle key={p.key} cx={first === last ? 450 : 45 + (Date.parse(p.acquiredAt) - first) / (last - first) * 825} cy={77 - p.meanNdvi! * 60} r="5" fill="var(--fieldwork-accent)"><title>{new Date(p.acquiredAt).toLocaleDateString()} · {p.meanNdvi?.toFixed(3)}</title></circle>)}{points.length > 0 && <><text x="45" y="170" fill="currentColor" fontSize="12">{new Date(first).toLocaleDateString()}</text><text x="870" y="170" fill="currentColor" fontSize="12" textAnchor="end">{new Date(last).toLocaleDateString()}</text></>}</svg>
}
function YieldComparison({ results, t }: { results: NonNullable<LearningSnapshot['trials'][number]['results']>; t: Props['t'] }): ReactNode {
  if (results.baselineMean === null || results.alternativeMean === null || results.meanDifference === null) return <figure className={css.yieldFigure}><figcaption>{t('noHarvestData')}</figcaption><p>{t('noNumericConclusion')}</p></figure>
  const max = Math.max(results.baselineMean, results.alternativeMean, 1)
  return <figure className={css.yieldFigure}><figcaption>{t('observedMeans')} ({results.unit})</figcaption>{[{ label: t('baseline'), value: results.baselineMean }, { label: t('alternativePractice'), value: results.alternativeMean }].map((r, i) => <div className={css.yieldRow} key={i}><span>{r.label}</span><div className={css.yieldTrack}><div className={i === 0 ? css.yieldBaseline : css.yieldAlternative} style={{ width: `${r.value / max * 100}%` }} /></div><strong>{r.value.toFixed(3)}</strong></div>)}<p>{t('meanDifference')}: {results.meanDifference.toFixed(3)} {results.unit}</p></figure>
}
