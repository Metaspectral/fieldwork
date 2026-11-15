/** My farm overview: the farm map, the fields table and field conditions, all following the selected field. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FarmPicture } from '../../../plugins/farm-picture-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
import { FarmMap } from './farm-map.tsx'
import { canCheck, FieldConditions } from './field-conditions.tsx'
import { FieldsTable } from './fields.tsx'
import type { FieldworkKey } from './locales.ts'
import { useNasaChecks } from './nasa-checks.tsx'

interface Props { fields: FarmState['fields']; selectedId: string | null; picture: FarmPicture | null; busy: boolean; t(key: FieldworkKey): string; select(fieldId: string | null): void; openRotation(): void; addField(): void; getPicture(): void; loadExample(): void }
/**
 * The top of My farm: where the fields are, what they grew, and what past seasons looked like on them.
 * @param props - Field records, the shared field selection, the saved picture if any, and the page actions the cards start.
 * @returns The map, fields and field conditions cards. The conditions column and card are left out when the NASA checks plugin is not installed.
 */
export function FarmOverview({ fields, selectedId, picture, busy, t, select, openRotation, addField, getPicture, loadExample }: Props): ReactNode {
  const nasa = useNasaChecks()
  const checks = nasa.status === null || nasa.status === 'absent' ? undefined : nasa.status.checks
  const condition = checks && ((field: FarmState['fields'][number]) => {
    const last = checks.find(c => c.fieldId === field.id)
    return !canCheck(field) ? t('conditionsNoLocation') : !last ? t('conditionsNotChecked') : last.outline === 'point' ? t('conditionsWeatherOnly') : `${t('conditionsChecked')} ${last.checkedAt.slice(0, 10)}`
  })
  const filtered = fields.some(f => f.id === selectedId)
  return <>
    <FarmMap fields={fields} selectedId={selectedId} picture={picture} busy={busy} t={t} getPicture={getPicture} loadExample={loadExample} />
    <FieldsTable fields={fields} selectedId={selectedId} t={t} condition={condition} actions={<>{filtered && <Button variant="outline" onClick={() => select(null)}>{t('showAllFields')}</Button>}<Button variant="outline" onClick={openRotation}>{t('openRotation')}</Button><Button variant="outline" onClick={addField}>{t('addField')}</Button></>} />
    <FieldConditions fields={fields} selectedId={selectedId} select={select} t={t} />
  </>
}
