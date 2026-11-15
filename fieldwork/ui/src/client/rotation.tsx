/** Rotation page: the rotation plan per field with recorded and planned seasons, past seasons and risk, saved plans with their budgets, and one plan dialog per field. */
import { Fragment, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { fieldRotation, plannedCrop, rotationCalculation, rotationCrops, rotationLibrary, type RotationCropId, type RotationInputs, type RotationPlan, type RotationResult } from '../../../plugins/rotation-domain.ts'
import type { FarmState } from '../../../plugins/records.ts'
import type { Face } from './controller.ts'
import { FieldSeasonContext } from './context.tsx'
import { CropPill, FieldName, YearCrop, acresToHa, cropKeys, cropLabel, fieldAcres, isCrop } from './fields.tsx'
import type { FieldworkKey } from './locales.ts'
import { RotationRisk } from './rotation-risk.tsx'
import css from './page.module.css'
import own from './my-farm.module.css'
type Props = PropsRuntime<'main'> & PropsLocale<'fieldwork'> & InjectFace<Face>
type T = (key: FieldworkKey) => string
type Field = FarmState['fields'][number]
type PlanSide = RotationInputs['current']
type Review = { command: Record<string, unknown>; description: string }
type Column = { yield: string; price: string; otherIncome: string; costs: string }
/** One rotation being edited: a library id, `own` for a typed crop order, or blank for none. */
type Side = { key: string; own: RotationCropId[]; columns: Column[] }
type Draft = { fieldId: string; supersedes?: string; current: Side; alternative: Side; landCost: string; currency: 'CAD' | 'USD'; evidence: RotationPlan['evidence']; reason: string; choice: RotationPlan['choice']; startIndex: number }
/** Seasons drawn ahead of the working season, the working season included: one full cycle of the longest rotation on file. */
const seasonsAhead = 4
const sourceKeys = { 'published-study': 'sourcePublishedStudy', community: 'sourceCommunity', experiment: 'sourceExperiment', farmer: 'sourceFarmer' } as const
const evidenceKeys = { 'farmer-reported': 'evidenceOwnRecords', assumed: 'evidenceEstimates', demo: 'evidenceDemo' } as const
const rows = [['yield', 'yieldPerAcre'], ['price', 'pricePerUnit'], ['otherIncome', 'otherIncomePerAcre'], ['costs', 'costsBeforeLand']] as const
const blank = (): Column => ({ yield: '', price: '', otherIncome: '', costs: '' })
const number = (value: string) => value.trim() === '' || Number.isNaN(Number(value)) ? undefined : Number(value)
const money = (value: number | undefined, currency: string) => value === undefined ? undefined : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
const sideCrops = (side: Side): readonly RotationCropId[] => side.key === 'own' ? side.own : rotationLibrary.rotations.find(r => r.id === side.key)?.crops ?? []
const rotationLabel = (t: T, crops: readonly RotationCropId[]) => crops.length === 1 ? `${t('continuousCrop')} ${t(cropKeys[crops[0]!]).toLowerCase()}` : crops.map((c, i) => i ? t(cropKeys[c]).toLowerCase() : t(cropKeys[c])).join('–')
// The limits sentences belong to the one study on file; the continuous-corn note is specific to its `ccc` entry.
const limitsLabel = (t: T, rotationId: string | undefined) => !rotationLibrary.rotations.some(r => r.id === rotationId) ? t('ownOrderLimits') : rotationId === 'ccc' ? `${t('rotationStudyLimits')} ${t('rotationContinuousCornNote')}` : t('rotationStudyLimits')
const sourceLine = (t: T, side: PlanSide) => `${t(sourceKeys[side.source.kind])}${side.source.kind === 'farmer' ? '' : ` · ${side.source.citation}${side.source.doi ? ` doi:${side.source.doi}` : ''}`}`
const keep = (side: Side, crops: readonly RotationCropId[]): Column[] => { const old = sideCrops(side); return crops.map(c => side.columns[old.indexOf(c)] ?? blank()) }
const fromPlanSide = (side: PlanSide): Side => ({ key: rotationLibrary.rotations.some(r => r.id === side.rotationId) ? side.rotationId! : 'own', own: [...side.crops], columns: side.columns.map(c => ({ yield: String(c.yield ?? ''), price: String(c.price ?? ''), otherIncome: String(c.otherIncome ?? ''), costs: String(c.costs ?? '') })) })
/** Farmer-entered budget of one rotation, or of two side by side. */
function Budget({ t, calculation, names }: { t: T; calculation: RotationResult; names: [string, string | undefined] }): ReactNode {
  const line = (label: string, name: string, side: RotationResult['current']) => <tr><th scope="row">{label}<span className={own.rowLine}>{name}</span></th><td>{money(side.perAcre, calculation.currency) ?? t('notCalculated')}</td><td>{money(side.wholeField, calculation.currency) ?? '—'}</td></tr>
  return <div className={css.tableScroll}><table className={own.table}>
    <thead><tr><th scope="col">{t('scenario')}</th><th scope="col">{t('averageProfit')}</th><th scope="col">{t('wholeFieldPerYear')}</th></tr></thead>
    <tbody>
      {line(t('currentRotation'), names[0], calculation.current)}
      {calculation.alternative && line(t('comparedRotation'), names[1] ?? '', calculation.alternative)}
      {calculation.alternative && <tr><th scope="row">{t('rotationDifference')}</th><td>{money(calculation.difference?.perAcre, calculation.currency) ?? t('notCalculated')}</td><td>{money(calculation.difference?.wholeField, calculation.currency) ?? '—'}</td></tr>}
    </tbody>
  </table></div>
}
/**
 * Native Rotation panel.
 * @param props - Shared farm records, locale and page commands.
 * @returns The rotation plan table, past seasons and risk, the saved plans and their dialogs.
 */
export function RotationPage(props: Props): ReactNode {
  const { t } = props
  const state = props.useRecords(s => s)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [crops, setCrops] = useState<{ fieldId: string; values: Record<string, string> } | null>(null)
  const [adding, setAdding] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const [details, setDetails] = useState<Record<string, boolean>>({})
  const data = state.data
  if (!data) return <section className={css.page}><h1>{t('rotation')}</h1><p role="status">{state.error ?? t('loading')}</p></section>
  const season = state.selection.season ?? new Date().getUTCFullYear() + 1
  const seasons = Array.from({ length: seasonsAhead }, (_, i) => season + i)
  // The three most recent years with a record on any field; a farm with fewer keeps the years just before the season.
  const recorded = [...new Set(data.fields.flatMap(f => Object.keys(f.years).map(Number)))].filter(y => y < season).sort((a, b) => b - a)
  const past = [...new Set([...recorded.slice(0, 3), season - 1, season - 2, season - 3])].slice(0, 3).sort((a, b) => a - b)
  const editYears = [...new Set([...past, season - 1])]
  const cropValues = (field: Field) => Object.fromEntries(editYears.map(y => [String(y), field.years[String(y)]?.crop ?? '']))
  const fields = data.fields.filter(f => !state.selection.fieldId || f.id === state.selection.fieldId)
  const plans = data.rotationPlans.filter(p => fields.some(f => f.id === p.fieldId) && !data.rotationPlans.some(q => q.supersedes === p.id && (q.status === 'accepted' || p.status === 'proposed'))).reverse()
  const close = () => { setReview(null); setDraft(null); setCrops(null); setAdding(false) }
  // The controller publishes a failure as state.error; the review stays open to show it.
  const run = async (command: Record<string, unknown>) => { if (await props.perform(command).then(() => true, () => false)) close() }
  const request = (action: string, payload: unknown, lines: (string | undefined)[]) => setReview({ command: { action, payload, confirmed: true }, description: lines.filter(Boolean).join('\n') })
  const planSide = (plan: RotationPlan) => plan.choice === 'alternative' && plan.inputs.alternative ? plan.inputs.alternative : plan.inputs.current
  const planCrops = (plan: RotationPlan) => planSide(plan).crops
  // A field draws its accepted plan; with none accepted, its latest proposed plan, marked as proposed.
  const shownPlan = (fieldId: string) => fieldRotation(data.rotationPlans, fieldId) ?? data.rotationPlans.filter(p => p.fieldId === fieldId && p.status === 'proposed').at(-1)
  const dash = <span className={own.muted}>—</span>
  // The default crop for the season continues the order from the field's most recent recorded crop; the farmer can change it.
  const start = (field: Field, order: readonly RotationCropId[]) => {
    const last = Object.keys(field.years).map(Number).filter(y => y < season && field.years[String(y)]?.crop).sort((a, b) => b - a)[0]
    const index = last === undefined ? -1 : order.indexOf(field.years[String(last)]!.crop as RotationCropId)
    return index < 0 || last === undefined ? 0 : (index + season - last) % order.length
  }
  const open = (field: Field, plan = data.rotationPlans.filter(p => p.fieldId === field.id).at(-1)) => {
    const evidence = field.evidence === 'demo' ? 'demo' : plan && plan.evidence !== 'demo' ? plan.evidence : 'farmer-reported'
    const empty: Side = { key: '', own: [], columns: [] }
    if (!plan) { setDraft({ fieldId: field.id, current: empty, alternative: empty, landCost: '', currency: 'USD', evidence, reason: '', choice: 'current', startIndex: 0 }); return }
    const switched = plan.status === 'accepted' && plan.choice === 'alternative' && plan.inputs.alternative
    const order = planCrops(plan)
    setDraft({ fieldId: field.id, supersedes: plan.id, current: fromPlanSide(switched || plan.inputs.current), alternative: switched || !plan.inputs.alternative ? empty : fromPlanSide(plan.inputs.alternative), landCost: String(plan.inputs.landCost ?? ''), currency: plan.inputs.currency, evidence, reason: plan.reason, choice: switched ? 'current' : plan.choice, startIndex: season >= plan.season ? (plan.startIndex + season - plan.season) % order.length : plan.startIndex })
  }
  const draftField = draft && data.fields.find(f => f.id === draft.fieldId)
  const inputs = (d: Draft, field: Field): RotationInputs | undefined => {
    const side = (s: Side): PlanSide => {
      const entry = rotationLibrary.rotations.find(r => r.id === s.key)
      return { ...(entry ? { rotationId: entry.id } : {}), crops: [...sideCrops(s)], source: entry?.source ?? { kind: 'farmer', citation: t('sourceFarmer') }, columns: s.columns.map(c => { const column: PlanSide['columns'][number] = {}; for (const [k] of rows) { const n = number(c[k]); if (n !== undefined) column[k] = n } return column }) }
    }
    if (!field.areaHa || !sideCrops(d.current).length) return undefined
    const landCost = number(d.landCost)
    return { areaHa: field.areaHa, ...(landCost === undefined ? {} : { landCost }), currency: d.currency, current: side(d.current), ...(sideCrops(d.alternative).length ? { alternative: side(d.alternative) } : {}) }
  }
  const calculate = (value: RotationInputs | undefined) => { try { return value && rotationCalculation(value) } catch { /* A number outside the accepted range leaves the result blank; the form reports the field. */ return undefined } }
  const draftInputs = draft && draftField ? inputs(draft, draftField) : undefined
  const result = calculate(draftInputs)
  const chosen = draft ? sideCrops(draft.choice === 'alternative' ? draft.alternative : draft.current) : []
  const setSide = (which: 'current' | 'alternative', change: (side: Side) => Side) => setDraft(d => {
    if (!d || !draftField) return d
    const next = { ...d, [which]: change(d[which]) }
    if (!sideCrops(next.alternative).length) next.choice = 'current'
    const order = sideCrops(next.choice === 'alternative' ? next.alternative : next.current)
    return { ...next, startIndex: start(draftField, order) }
  })
  const pick = (which: 'current' | 'alternative', key: string) => setSide(which, s => { const next = { ...s, key }; return { ...next, columns: keep(s, sideCrops(next)) } })
  const order = (which: 'current' | 'alternative', index: number, crop: string) => setSide(which, s => { const own = isCrop(crop) ? [...s.own.slice(0, index), crop, ...s.own.slice(index + 1)] : s.own.filter((_, i) => i !== index); return { ...s, own, columns: own.map((c, i) => (c === s.own[i] ? s.columns[i] : undefined) ?? blank()) } })
  const cell = (which: 'current' | 'alternative', index: number, key: keyof Column, value: string) => setSide(which, s => ({ ...s, columns: s.columns.map((c, i) => i === index ? { ...c, [key]: value } : c) }))
  const picker = (which: 'current' | 'alternative') => {
    const side = draft![which], entry = rotationLibrary.rotations.find(r => r.id === side.key), list = sideCrops(side), label = t(which === 'current' ? 'currentRotation' : 'comparedRotation')
    return <section>
      <label className={css.field}>{label}<select aria-label={label} value={side.key} onChange={e => pick(which, e.target.value)} required={which === 'current'}>
        <option value="">{t(which === 'current' ? 'choose' : 'noComparison')}</option>
        <optgroup label={`${t('sourcePublishedStudy')} · ${rotationLibrary.region.name}`}>{rotationLibrary.rotations.map(r => <option key={r.id} value={r.id}>{rotationLabel(t, r.crops)} · {t(r.kind === 'usual-in-study' ? 'usualInStudy' : 'testedAlternative')}</option>)}</optgroup>
        <optgroup label={t('sourceCommunity')}><option disabled>{t('noneOnFile')}</option></optgroup>
        <optgroup label={t('sourceExperiment')}><option disabled>{t('noneOnFile')}</option></optgroup>
        <optgroup label={t('sourceFarmer')}><option value="own">{t('ownOrder')}</option></optgroup>
      </select></label>
      {side.key === 'own' && <div className={css.cropOrder}>{[...side.own, ''].slice(0, 8).map((c, i) => <select key={i} aria-label={`${label} · ${t('cropInOrder')} ${i + 1}`} value={c} onChange={e => order(which, i, e.target.value)}><option value="">{t(c ? 'removeCrop' : 'addCrop')}</option>{rotationCrops.map(o => <option key={o.id} value={o.id}>{t(cropKeys[o.id])}</option>)}</select>)}</div>}
      {side.key && <p className={css.notice}><small>{entry ? `${t('rotationSource')}: ${t(sourceKeys[entry.source.kind])} · ${entry.source.citation} doi:${entry.source.doi}` : `${t('rotationSource')}: ${t('sourceFarmer')}`}<br />{t('rotationLimits')}: {limitsLabel(t, entry?.id)}</small></p>}
      {list.length > 0 && <div className={css.tableScroll}><table className={`${css.comparisonTable} ${css.sheet}`}>
        <thead><tr><th scope="col">{t('perAcre')}</th>{list.map((c, i) => <th scope="col" key={i}>{i + 1} · {t(cropKeys[c])}</th>)}</tr></thead>
        <tbody>
          {rows.map(([key, name]) => <tr key={key}><th scope="row">{t(name)}{key === 'yield' || key === 'price' ? '' : ` (${draft!.currency})`}</th>{list.map((c, i) => <td key={i}><input type="number" min="0" max="1000000" step="any" aria-label={`${label} · ${i + 1} ${t(cropKeys[c])} · ${t(name)}`} placeholder={key === 'yield' ? rotationCrops.find(o => o.id === c)!.unit : key === 'price' ? `${draft!.currency}/${rotationCrops.find(o => o.id === c)!.unit}` : ''} value={side.columns[i]?.[key] ?? ''} onChange={e => cell(which, i, key, e.target.value)} /></td>)}</tr>)}
          <tr><th scope="row">{t('profitPerAcre')}</th>{list.map((_, i) => <td key={i}>{money(result?.[which]?.columns[i]?.profit, draft!.currency) ?? '—'}</td>)}</tr>
        </tbody>
      </table></div>}
    </section>
  }
  const propose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft || !draftField || !draftInputs || !result) return
    const names: [string, string | undefined] = [rotationLabel(t, draftInputs.current.crops), draftInputs.alternative && rotationLabel(t, draftInputs.alternative.crops)]
    request('propose-rotation', { fieldId: draft.fieldId, season, ...(draft.supersedes ? { supersedes: draft.supersedes } : {}), reason: draft.reason, choice: draft.choice, startIndex: draft.startIndex, evidence: draft.evidence, inputs: draftInputs }, [
      `${draftField.name} · ${season}`,
      `${t(draft.choice === 'alternative' ? 'switchRotation' : 'keepCurrent')}: ${draft.choice === 'alternative' ? names[1] : names[0]}`,
      `${t('startCrop')} ${season}: ${cropLabel(t, chosen[draft.startIndex])}`,
      `${t('currentRotation')}: ${names[0]} · ${money(result.current.perAcre, result.currency) ?? t('notCalculated')}`,
      names[1] && `${t('comparedRotation')}: ${names[1]} · ${money(result.alternative?.perAcre, result.currency) ?? t('notCalculated')}`,
      names[1] && `${t('rotationDifference')}: ${money(result.difference?.perAcre, result.currency) ?? t('notCalculated')}`,
      `${t('numbersFrom')}: ${t(evidenceKeys[draft.evidence])}`, draft.reason, t('proposeRotationScope'),
    ])
  }
  const saveCrops = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const field = crops && data.fields.find(f => f.id === crops.fieldId)
    if (!crops || !field) return
    const changed = Object.entries(crops.values).filter(([year, crop]) => crop !== (field.years[year]?.crop ?? ''))
    if (!changed.length) { setCrops(null); return }
    request('field-crops', { fieldId: field.id, crops: Object.fromEntries(changed.map(([year, crop]) => [year, crop || null])) }, [field.name, ...changed.map(([year, crop]) => `${year} · ${crop ? cropLabel(t, crop) : t('notRecorded')}`), t('editCropsScope')])
  }
  const addField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const v = Object.fromEntries(new FormData(event.currentTarget))
    request('field', { name: v.name, areaHa: acresToHa(Number(v.acres)), evidence: 'farmer-reported', notes: [] }, [`${String(v.name)} · ${String(v.acres)} ${t('acres').toLowerCase()}`])
  }
  return <section className={css.page}>
    <header className={css.header}><div><p className={css.brandLine}>{t('brandLine')}</p><h1>{t('rotation')}</h1><p>{t('rotationIntro')}</p></div></header>
    <FieldSeasonContext data={data} selection={{ ...state.selection, season }} select={props.selectContext} t={t} />
    <div className={css.status}><span>{t('local')}</span><span>{t('private')}</span></div>
    {state.error && !review && <p role="alert" className={css.error}>{state.error}</p>}
    {state.saved && <p role="status" className={css.notice}>{t('saved')}</p>}
    <section className={css.card} aria-label={t('rotationTable')}>
      <div className={own.cardHead}><div><h2>{t('rotationTable')}</h2><p>{t('rotationTableHint')}</p></div></div>
      {fields.length ? <div className={css.tableScroll}><table className={own.table}>
        <thead>
          <tr className={own.spans}><td colSpan={2} /><th scope="colgroup" colSpan={past.length}>{t('recordedSeasons')}</th><th scope="colgroup" colSpan={seasons.length} data-divide>{t('plannedSeasons')}</th><td colSpan={2} /></tr>
          <tr><th scope="col">{t('fieldName')}</th><th scope="col">{t('acres')}</th>{past.map(y => <th scope="col" key={y}>{y}</th>)}{seasons.map((y, i) => <th scope="col" key={y} data-divide={i === 0 || undefined}>{y}</th>)}<th scope="col">{t('rotation')}</th><th scope="col"><span className={css.srOnly}>{t('rotationActions')}</span></th></tr>
        </thead>
        <tbody>{fields.map(f => {
          const plan = shownPlan(f.id), side = plan && planSide(plan), proposed = plan?.status === 'proposed'
          return <tr key={f.id}>
            <th scope="row"><FieldName field={f} /></th><td>{fieldAcres(f) ?? dash}</td>
            {past.map(y => <td key={y}><YearCrop entry={f.years[String(y)]} t={t} /></td>)}
            {seasons.map((y, i) => { const crop = plan && plannedCrop(plan, y); return <td key={y} data-divide={i === 0 || undefined}>{crop ? <CropPill crop={crop} t={t} proposed={proposed} /> : dash}</td> })}
            <td className={own.nowrap}>{side ? <>{rotationLabel(t, side.crops)}<span className={own.rowLine}>{t(proposed ? 'planProposed' : 'planAccepted')} · {t(sourceKeys[side.source.kind])}</span></> : <span className={own.muted}>{t('rotationNotSet')}</span>}</td>
            <td><div className={own.rowButtons}><Button variant="outline" size="sm" disabled={!f.areaHa} aria-label={`${t('planRotation')} · ${f.name}`} onClick={() => open(f)}>{t('planRotation')}</Button></div></td>
          </tr>
        })}</tbody>
      </table></div> : <p>{t('rotationEmpty')}</p>}
      <div className={own.cardActions}>
        {fields[0] && <Button variant="outline" onClick={() => setCrops({ fieldId: fields[0]!.id, values: cropValues(fields[0]!) })}>{t('editCrops')}</Button>}
        <Button variant="outline" onClick={() => setAdding(true)}>{t('addField')}</Button>
        {!data.fields.some(f => f.geometry?.example !== undefined) && <Button variant="outline" disabled={state.busy} onClick={() => request('brookings-example', {}, [t('brookingsExampleScope')])}>{t('loadBrookingsExample')}</Button>}
        {data.rotationPlans.length === 0 && <Button variant="outline" disabled={state.busy} onClick={() => request('rotation-demo', {}, [t('rotationDemoScope')])}>{t('loadRotationDemo')}</Button>}
      </div>
    </section>
    <RotationRisk fields={fields} planFor={shownPlan} seasons={seasons} t={t} />
    <section className={css.card} aria-label={t('rotationPlans')}>
      <h2>{t('rotationPlans')}</h2>
      {plans.length ? <div className={`${css.tableScroll} ${own.scroll}`}><table className={own.table}>
        <thead><tr><th scope="col">{t('fieldName')}</th><th scope="col">{t('planSeason')}</th><th scope="col">{t('rotationDecision')}</th><th scope="col">{t('differencePerAcre')}</th><th scope="col">{t('planStatus')}</th><th scope="col"><span className={css.srOnly}>{t('rotationActions')}</span></th></tr></thead>
        <tbody>{plans.map(p => {
          const field = data.fields.find(f => f.id === p.fieldId)
          const names: [string, string | undefined] = [rotationLabel(t, p.inputs.current.crops), p.inputs.alternative && rotationLabel(t, p.inputs.alternative.crops)]
          const switched = p.choice === 'alternative' && p.calculation.alternative !== undefined, decision = t(switched ? 'switchRotation' : 'keepCurrent'), chosenName = switched ? names[1] : names[0]
          const title = `${field?.name ?? ''} · ${p.season}`, shown = details[p.id] ?? p.status === 'proposed', toggle = t(shown ? 'planHideDetails' : 'planDetails')
          return <Fragment key={p.id}>
            <tr data-open={shown}>
              <th scope="row">{field ? <FieldName field={field} /> : dash}</th>
              <td>{p.season}</td>
              <td className={own.nowrap}>{chosenName}<span className={own.rowLine}>{decision}</span></td>
              <td>{money(p.calculation.difference?.perAcre, p.calculation.currency) ?? dash}</td>
              <td className={own.nowrap}>{t(p.status === 'accepted' ? 'planAccepted' : 'planProposed')}<span className={own.rowLine}>{t(evidenceKeys[p.evidence])} · {t('revision')} {p.revision}</span></td>
              <td><div className={own.rowButtons}>
                {p.status === 'proposed' && <Button variant="primary" size="sm" disabled={state.busy} aria-label={`${t('acceptRotation')} · ${title}`} onClick={() => request('accept-rotation', { id: p.id }, [`${title} · ${t('revision')} ${p.revision}`, `${decision}: ${chosenName}`, t('acceptRotationScope')])}>{t('acceptRotation')}</Button>}
                <Button variant="outline" size="sm" aria-expanded={shown} aria-label={`${toggle} · ${title}`} onClick={() => setDetails({ ...details, [p.id]: !shown })}>{toggle}</Button>
              </div></td>
            </tr>
            {shown && <tr className={own.detail}><td colSpan={6}><div>
              <p>{t('startCrop')} {p.season}: {cropLabel(t, planCrops(p)[p.startIndex])}</p>
              <p className={css.preserveLines}>{p.reason}</p>
              <Budget t={t} calculation={p.calculation} names={names} />
              <p className={own.source}>{t('rotationBudgetLimits')}</p>
              {[p.inputs.current, ...(p.inputs.alternative ? [p.inputs.alternative] : [])].map((side, i) => <p className={own.source} key={i}>{names[i]} — {t('rotationSource')}: {sourceLine(t, side)}. {t('rotationLimits')}: {limitsLabel(t, side.rotationId)}</p>)}
              {field && <div className={own.cardActions}><Button variant="outline" size="sm" onClick={() => open(field, p)}>{t('newRevision')}</Button></div>}
            </div></td></tr>}
          </Fragment>
        })}</tbody>
      </table></div> : <p className={own.muted}>{t('rotationPlansEmpty')}</p>}
    </section>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={draft !== null && review === null} onClose={close} closeLabel={t('close')} title={`${t('planRotation')} · ${draftField?.name ?? ''} · ${season}`}>
      {draft && draftField && <form onSubmit={propose}>
        <p>{t('rotationSheetHint')}</p>
        <div className={css.grid}>
          <label className={css.field}>{t('landCost')}<input type="number" min="0" max="1000000" step="any" value={draft.landCost} onChange={e => setDraft({ ...draft, landCost: e.target.value })} /></label>
          <label className={css.field}>{t('currency')}<select aria-label={t('currency')} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value === 'CAD' ? 'CAD' : 'USD' })}><option>USD</option><option>CAD</option></select></label>
        </div>
        {picker('current')}
        {picker('alternative')}
        {result && <><h3>{t('rotationResult')} · {fieldAcres(draftField)} {t('acres').toLowerCase()}</h3><Budget t={t} calculation={result} names={[rotationLabel(t, sideCrops(draft.current)), sideCrops(draft.alternative).length ? rotationLabel(t, sideCrops(draft.alternative)) : undefined]} /><p className={css.notice}><small>{t('rotationBudgetLimits')}</small></p></>}
        <div className={css.grid}>
          <label className={css.field}>{t('rotationDecision')}<select aria-label={t('rotationDecision')} value={draft.choice} onChange={e => setDraft({ ...draft, choice: e.target.value === 'alternative' ? 'alternative' : 'current', startIndex: start(draftField, sideCrops(e.target.value === 'alternative' ? draft.alternative : draft.current)) })}><option value="current">{t('keepCurrent')}</option><option value="alternative" disabled={!sideCrops(draft.alternative).length}>{t('switchRotation')}</option></select></label>
          <label className={css.field}>{t('startCrop')} {season}<select aria-label={t('startCrop')} value={draft.startIndex} onChange={e => setDraft({ ...draft, startIndex: Number(e.target.value) })}>{chosen.map((c, i) => <option key={i} value={i}>{i + 1} · {t(cropKeys[c])}</option>)}</select></label>
        </div>
        <label className={css.field}>{t('numbersFrom')}<select aria-label={t('numbersFrom')} value={draft.evidence} onChange={e => setDraft({ ...draft, evidence: e.target.value === 'demo' ? 'demo' : e.target.value === 'assumed' ? 'assumed' : 'farmer-reported' })}><option value="farmer-reported">{t('evidenceOwnRecords')}</option><option value="assumed">{t('evidenceEstimates')}</option>{draftField.evidence === 'demo' && <option value="demo">{t('evidenceDemo')}</option>}</select></label>
        <label className={css.field}>{t('rotationReason')}<textarea required maxLength={2000} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>
        <div className={css.actions}><Button type="submit" variant="primary" disabled={!result}>{t('reviewProposal')}</Button></div>
      </form>}
    </Modal>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={crops !== null && review === null} onClose={close} closeLabel={t('close')} title={`${t('editCrops')} · ${data.fields.find(f => f.id === crops?.fieldId)?.name ?? ''}`}>
      {crops && <form onSubmit={saveCrops}>
        <p>{t('editCropsScope')}</p>
        {fields.length > 1 && <label className={css.field}>{t('fieldName')}<select aria-label={t('fieldName')} value={crops.fieldId} onChange={e => { const field = fields.find(f => f.id === e.target.value); if (field) setCrops({ fieldId: field.id, values: cropValues(field) }) }}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
        <div className={css.grid}>{Object.entries(crops.values).map(([year, crop]) => <label className={css.field} key={year}>{year}<select aria-label={year} value={crop} onChange={e => setCrops({ ...crops, values: { ...crops.values, [year]: e.target.value } })}><option value="">{t('notRecorded')}</option>{crop && !isCrop(crop) && <option value={crop}>{crop}</option>}{rotationCrops.map(o => <option key={o.id} value={o.id}>{t(cropKeys[o.id])}</option>)}</select></label>)}</div>
        <div className={css.actions}><Button type="submit" variant="primary">{t('reviewProposal')}</Button></div>
      </form>}
    </Modal>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={adding && review === null} onClose={close} closeLabel={t('close')} title={t('addField')}>
      <form onSubmit={addField}>
        <div className={css.grid}>
          <label className={css.field}>{t('fieldName')}<input name="name" required maxLength={200} /></label>
          <label className={css.field}>{t('fieldAcres')}<input name="acres" type="number" min="0.1" max="240000" step="any" required /></label>
        </div>
        <div className={css.actions}><Button type="submit" variant="primary">{t('reviewProposal')}</Button></div>
      </form>
    </Modal>
    <Modal className={css.researchModal!} contentClassName={css.researchModalContent!} open={review !== null} onClose={() => setReview(null)} closeLabel={t('close')} title={t('review')} footer={<Button disabled={state.busy} onClick={() => review && void run(review.command)}>{t('confirm')}</Button>}>
      <p className={css.preserveLines}>{review?.description}</p>
      {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    </Modal>
  </section>
}
