/** My farm map: located fields drawn over the saved satellite picture, or on a plain canvas when there is none. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { fieldLocation, pictureProjection, type FarmPicture } from '../../../plugins/farm-picture-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
import type { FieldworkKey } from './locales.ts'
import { cropLabel, fieldAcres } from './rotation.tsx'
import css from './page.module.css'
const plainWidth = 960, plainPadding = 60
/** Estimated width of one label character and height of a name-and-crop label, in map units. */
const labelCharacter = 9, labelLines = 38
interface Props { fields: FarmState['fields']; selectedId?: string | null; picture: FarmPicture | null; busy: boolean; t(key: FieldworkKey): string; getPicture(): void; loadExample(): void }
/**
 * Card showing where the located fields are, each labelled with its name and most recent recorded crop.
 * A selected field is drawn brighter with its area; the map still frames every located field so its neighbours stay visible.
 * @param props - Fields, the selected field id if any, the saved picture if any, and the two reviewed actions the card can start.
 * @returns The map card; with no located field, a hint and the example button.
 */
export function FarmMap({ fields, selectedId, picture, busy, t, getPicture, loadExample }: Props): ReactNode {
  const located = fields.flatMap(f => { const location = fieldLocation(f.geometry); return location ? [{ field: f, location }] : [] })
  const exampleLoaded = fields.some(f => f.geometry?.example !== undefined)
  const example = !exampleLoaded && <Button variant="outline" disabled={busy} onClick={loadExample}>{t('loadBrookingsExample')}</Button>
  if (!located.length) return <section className={css.card}><h2>{t('farmMap')}</h2><p>{t('farmMapEmpty')}</p><div className={css.actions}>{example}</div></section>
  const all = located.flatMap(l => l.location.points)
  const onPicture = picture && pictureProjection(picture.corners)
  // A picture taken before a field was added does not cover it; the plain canvas is used until the picture is updated.
  const covered = onPicture && all.every(p => onPicture(p[0], p[1]).every(v => v >= 0 && v <= 1))
  const west = Math.min(...all.map(p => p[0])), east = Math.max(...all.map(p => p[0])), south = Math.min(...all.map(p => p[1])), north = Math.max(...all.map(p => p[1]))
  // East–west degrees shrink with latitude; without this the plain canvas would look stretched.
  const squeeze = Math.cos((south + north) / 2 * Math.PI / 180)
  const spanX = Math.max((east - west) * squeeze, 1e-4), spanY = Math.max(north - south, 1e-4), unit = (plainWidth - 2 * plainPadding) / spanX
  const width = covered ? picture.width : plainWidth, height = covered ? picture.height : Math.round(spanY * unit + 2 * plainPadding)
  const place = (p: readonly [number, number]): [number, number] => {
    if (covered) { const [u, v] = onPicture(p[0], p[1]); return [u * width, v * height] }
    return [plainPadding + (p[0] - west) * squeeze * unit, plainPadding + (north - p[1]) * unit]
  }
  // Neighbouring fields can be closer than their labels are wide; a label that would cover an earlier one moves down a line pair.
  const taken: { x: number; y: number; half: number }[] = []
  // Only a located field can be picked out; selecting a field without a location leaves the map as it is.
  const selected = located.some(l => l.field.id === selectedId) ? selectedId : undefined
  const labels = located.map(({ field, location }) => {
    const points = location.points.map(place), [year, entry] = Object.entries(field.years).sort((a, b) => Number(b[0]) - Number(a[0]))[0] ?? []
    const x = points.reduce((sum, p) => sum + p[0], 0) / points.length, y = points.reduce((sum, p) => sum + p[1], 0) / points.length
    const name = field.name.split(' · ')[0] ?? field.name, area = field.id === selected ? fieldAcres(field) : undefined
    const crop = [year && entry ? `${year} · ${entry.crop ? cropLabel(t, entry.crop) : entry.notes[0] ?? t('notRecorded')}` : undefined, area === undefined ? undefined : `${area} ${t('acres').toLowerCase()}`].filter(Boolean).join(' · ') || undefined
    const half = Math.max(name.length * labelCharacter, (crop?.length ?? 0) * labelCharacter * .85) / 2
    let labelY = location.kind === 'outline' ? y - 4 : y - 14
    while (taken.some(o => Math.abs(o.x - x) < o.half + half && Math.abs(o.y - labelY) < labelLines)) labelY += labelLines
    taken.push({ x, y: labelY, half })
    return { field, location, points, x, y, labelY, name, crop }
  })
  // The selected field is drawn last so its outline and label sit above its neighbours.
  const drawn = selected === undefined ? labels : [...labels].sort((a, b) => Number(a.field.id === selected) - Number(b.field.id === selected))
  return <section className={css.card}>
    <h2>{t('farmMap')}</h2>
    <svg className={css.farmMap} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('farmMapLabel')}>
      {covered ? <image href={`${new URL('fieldwork-farm-picture', document.baseURI).href}?taken=${encodeURIComponent(picture.fetchedAt)}`} width={width} height={height} preserveAspectRatio="none" /> : <rect width={width} height={height} className={css.farmMapCanvas} />}
      {drawn.map(({ field, location, points, x, y, labelY, name, crop }) => <g key={field.id} data-state={selected === undefined ? undefined : field.id === selected ? 'selected' : 'other'}>
        {location.kind === 'outline' ? <polygon className={css.farmMapOutline} points={points.map(p => p.join(',')).join(' ')} /> : <circle className={css.farmMapPoint} cx={x} cy={y} r={7} />}
        <text className={css.farmMapName} x={x} y={labelY} textAnchor="middle">{name}</text>
        {crop && <text className={css.farmMapCrop} x={x} y={labelY + 17} textAnchor="middle">{crop}</text>}
      </g>)}
    </svg>
    {covered
      ? <p className={css.farmMapCaption}>{t('farmPictureTaken')} {picture.acquiredAt.slice(0, 10)} · <a href={picture.source} target="_blank" rel="noreferrer">{t('farmPictureSource')}</a> · {t('farmPictureLimit')}</p>
      : <p className={css.farmMapCaption}>{t(picture ? 'farmPictureStale' : 'farmPictureNone')}</p>}
    {exampleLoaded && <p className={css.farmMapCaption}>{t('brookingsExampleNote')}</p>}
    <div className={css.actions}><Button variant="outline" disabled={busy} onClick={getPicture}>{t(picture ? 'updateFarmPicture' : 'getFarmPicture')}</Button>{example}</div>
  </section>
}
