/** My farm map: located fields drawn over the saved satellite picture, or on a plain canvas when there is none, with where the picture, the outlines and the crop types come from. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { fieldLabelPoint, fieldLocation, pictureProjection, type FarmPicture } from '../../../plugins/farm-picture-types.ts'
import type { FarmState } from '../../../plugins/records.ts'
import { brookingsSource, shortYearNote } from '../../../plugins/rotation-domain.ts'
import type { FieldworkKey } from './locales.ts'
import { cropLabel } from './rotation.tsx'
import css from './page.module.css'
const plainWidth = 960, plainPadding = 60
/** Labels are laid out on a grid this wide whatever the picture's pixel size, so their text is the same size with and without a picture. */
const labelGrid = 960
/** Label text sizes match `.farmMapName` and `.farmMapCrop`; the rest is the label's line height, padding, corner radius and the space kept between two labels, in grid units. */
const nameSize = 13, cropSize = 12, labelLine = 15, labelPadX = 9, labelPadY = 5, labelRadius = 6, labelGap = 4
/** A field name or note longer than this is cut on the map; the Fields table shows it in full. */
const labelLength = 26
const short = (text: string) => text.length > labelLength ? `${text.slice(0, labelLength - 1).trimEnd()}…` : text
/** Estimated text width. The browser is not asked, so every render lays the labels out the same way; a CJK character is about as wide as it is tall, a Latin one a little over half. */
const textWidth = (text: string, size: number) => [...text].reduce((sum, c) => sum + ((c.codePointAt(0) ?? 0) > 0x2e7f ? 1 : .58), 0) * size
interface Box { x: number; y: number; w: number; h: number }
/** Keep each label inside the map and move labels that would cover each other apart, one up and one down, so each stays beside its own field. */
function separate(boxes: Box[], width: number, height: number): void {
  const keepInside = (b: Box) => { b.x = Math.min(Math.max(b.x, b.w / 2 + labelGap), width - b.w / 2 - labelGap); b.y = Math.min(Math.max(b.y, b.h / 2 + labelGap), height - b.h / 2 - labelGap) }
  boxes.forEach(keepInside)
  for (let pass = 0; pass < 12; pass++) {
    let moved = false
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
      const cover = (a.h + b.h) / 2 + labelGap - Math.abs(a.y - b.y)
      if (Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + labelGap || cover < .01) continue
      const [upper, lower] = a.y <= b.y ? [a, b] : [b, a]
      upper.y -= cover / 2; lower.y += cover / 2; keepInside(upper); keepInside(lower); moved = true
    }
    if (!moved) return
  }
}
interface Props { fields: FarmState['fields']; selectedId?: string | null; picture: FarmPicture | null; busy: boolean; t(key: FieldworkKey): string; getPicture(): void; loadExample(): void }
/**
 * Card showing where the located fields are, each labelled with its name and most recent recorded crop, above a short list of where the picture, the outlines and the crop types come from.
 * A selected field is drawn brighter; the map still frames every located field so its neighbours stay visible.
 * @param props - Fields, the selected field id if any, the saved picture if any, and the two reviewed actions the card can start.
 * @returns The map card; with no located field, a hint and the example button.
 */
export function FarmMap({ fields, selectedId, picture, busy, t, getPicture, loadExample }: Props): ReactNode {
  const located = fields.flatMap(f => { const location = fieldLocation(f.geometry), anchor = fieldLabelPoint(f.geometry); return location && anchor ? [{ field: f, location, anchor }] : [] })
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
  // Only a located field can be picked out; selecting a field without a location leaves the map as it is.
  const selected = located.some(l => l.field.id === selectedId) ? selectedId : undefined
  const latest = located.map(l => Object.entries(l.field.years).sort((a, b) => Number(b[0]) - Number(a[0]))[0])
  // When every field's most recent year is the same, the year is stated once under the map and left off the labels.
  const years = new Set(latest.flatMap(entry => entry ? [entry[0]] : [])), sharedYear = years.size === 1 ? [...years][0] : undefined
  const scale = width / labelGrid
  const marks = located.map(({ field, location, anchor }, i) => {
    const [year, entry] = latest[i] ?? [], [x, y] = place(anchor)
    const grown = entry && (entry.crop ? cropLabel(t, entry.crop) : entry.notes[0] ? short(shortYearNote(entry.notes[0])) : t('notRecorded'))
    const name = short(field.name.split(' · ')[0] ?? field.name), crop = grown === undefined ? undefined : sharedYear ? grown : `${year} · ${grown}`
    const box: Box = { x: x / scale, y: y / scale, w: Math.max(textWidth(name, nameSize), crop ? textWidth(crop, cropSize) : 0) + 2 * labelPadX, h: (crop ? 2 : 1) * labelLine + 2 * labelPadY }
    return { field, location, points: location.points.map(place), x, y, name, crop, box }
  })
  separate(marks.map(m => m.box), labelGrid, height / scale)
  // The selected field is drawn last so its outline and label sit above its neighbours.
  const drawn = selected === undefined ? marks : [...marks].sort((a, b) => Number(a.field.id === selected) - Number(b.field.id === selected))
  const state = (id: string) => selected === undefined ? undefined : id === selected ? 'selected' : 'other'
  const usda = located.some(l => l.field.geometry?.source === brookingsSource.id), own = located.some(l => l.field.geometry?.source !== brookingsSource.id)
  return <section className={css.card}>
    <h2>{t('farmMap')}</h2>
    <svg className={css.farmMap} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('farmMapLabel')}>
      {covered ? <image href={`${new URL('fieldwork-farm-picture', document.baseURI).href}?taken=${encodeURIComponent(picture.fetchedAt)}`} width={width} height={height} preserveAspectRatio="none" /> : <rect width={width} height={height} className={css.farmMapCanvas} />}
      {drawn.map(({ field, location, points, x, y }) => <g key={field.id} data-state={state(field.id)}>
        {location.kind === 'outline' ? <polygon className={css.farmMapOutline} points={points.map(p => p.join(',')).join(' ')} /> : <circle className={css.farmMapPoint} cx={x} cy={y} r={7} />}
      </g>)}
      <g transform={`scale(${scale})`}>
        {drawn.map(({ field, name, crop, box }) => <g key={field.id} className={css.farmMapLabel} data-state={state(field.id)} transform={`translate(${box.x} ${box.y})`}>
          <rect x={-box.w / 2} y={-box.h / 2} width={box.w} height={box.h} rx={labelRadius} />
          <text className={css.farmMapName} y={crop ? -3 : 4.5} textAnchor="middle">{name}</text>
          {crop && <text className={css.farmMapCrop} y={12} textAnchor="middle">{crop}</text>}
        </g>)}
      </g>
    </svg>
    <dl className={css.farmMapFacts}>
      <dt>{t('farmFactPicture')}</dt>
      <dd>{covered ? <>{t('farmFactKind')} · {t('farmFactTaken')} {picture.acquiredAt.slice(0, 10)} · {t('farmFactPixel')}</> : t(picture ? 'farmPictureStale' : 'farmPictureNone')}</dd>
      {covered && <>
        <dt>{t('farmFactScene')}</dt>
        <dd><a href={picture.source} target="_blank" rel="noreferrer">{picture.sceneId}</a> · {t('farmFactSaved')} {picture.fetchedAt.slice(0, 10)}</dd>
        <dt>{t('farmFactCredit')}</dt>
        <dd>{picture.attribution}</dd>
      </>}
      <dt>{t('farmFactOutlines')}</dt>
      <dd>{usda && <><a href={brookingsSource.url} target="_blank" rel="noreferrer">{brookingsSource.title}</a> · {t('farmFactOutlinesExample')}</>}{usda && own && ' · '}{own && t('farmFactRecords')}</dd>
      {marks.some(m => m.crop) && <>
        <dt>{t('farmFactCrops')}</dt>
        <dd>{sharedYear ? `${sharedYear} ${t('farmFactSeason')}` : t('farmFactLatest')}{usda && <> · {t('farmFactCropsExample')}</>}{own && <> · {t('farmFactRecords')}</>}</dd>
      </>}
    </dl>
    <div className={css.actions}><Button variant="outline" disabled={busy} onClick={getPicture}>{t(picture ? 'updateFarmPicture' : 'getFarmPicture')}</Button>{example}</div>
  </section>
}
