/** One field and season selection follows the farmer between native panels. */
import { useEffect, useState, type ReactNode } from 'react'
import type { FarmState } from '../../../plugins/records.ts'
import type { Face, FieldSelection } from './controller.ts'
import type { FieldworkKey } from './locales.ts'
import css from './investigation.module.css'
export function FieldSeasonContext({ data, selection, select, t }: { data: FarmState; selection: FieldSelection; select: Face['selectContext']; t(key: FieldworkKey): string }): ReactNode {
  const [seasonDraft, setSeasonDraft] = useState(String(selection.season ?? ''))
  useEffect(() => { setSeasonDraft(String(selection.season ?? '')) }, [selection.season])
  return <div className={css.contextBar}><label>{t('fieldName')}<select aria-label={t('contextField')} value={selection.fieldId ?? ''} onChange={e => select({ fieldId: e.target.value || null, investigationId: null })}><option value="">{t('allFields')}</option>{data.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>{t('season')}<input aria-label={t('contextSeason')} type="number" min="1900" max="2200" placeholder={t('seasonUnknown')} value={seasonDraft} onChange={e => setSeasonDraft(e.target.value)} onBlur={e => { if (!e.currentTarget.validity.valid) { e.currentTarget.reportValidity(); return }; const season = seasonDraft ? Number(seasonDraft) : null; if (season !== selection.season) select({ season, investigationId: null }) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></label><span>{t('contextHint')}</span></div>
}
