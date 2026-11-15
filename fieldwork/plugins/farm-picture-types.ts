/** Client-safe field locations and the saved satellite picture of the farm. */
import { z } from 'zod'
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-80).max(84)])
const locationSchema = z.union([
  z.looseObject({ type: z.literal('Polygon'), coordinates: z.tuple([z.array(point).min(4).max(1000)]) }),
  z.looseObject({ type: z.literal('Point'), coordinates: point }),
])
/** One saved true-colour picture. Corners are longitude/latitude of the picture's top-left, top-right, bottom-right and bottom-left. */
export const farmPictureSchema = z.object({
  sceneId: z.string().min(1).max(200), acquiredAt: z.iso.datetime(), fetchedAt: z.iso.datetime(), source: z.url(), attribution: z.string().min(1).max(400),
  width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096), corners: z.tuple([point, point, point, point]),
})
/** Saved farm picture description; the image bytes are served separately. */
export type FarmPicture = z.infer<typeof farmPictureSchema>
/** Where a field is: an outline ring or a single point, in longitude/latitude. */
export interface FieldLocation { kind: 'outline' | 'point'; points: [number, number][] }
/**
 * Read a field's stored geometry as a location.
 * @param geometry - The field's `geometry` value, from any provider.
 * @returns The outline or point, or undefined when the field has neither.
 */
export function fieldLocation(geometry: unknown): FieldLocation | undefined {
  const parsed = locationSchema.safeParse(geometry)
  if (!parsed.success) return undefined
  return parsed.data.type === 'Polygon' ? { kind: 'outline', points: parsed.data.coordinates[0] } : { kind: 'point', points: [parsed.data.coordinates] }
}
/**
 * Map longitude/latitude onto a saved picture. The picture is a small north-up cut of a projected image, so a straight-line fit through three corners is accurate to well under a pixel.
 * @param corners - The picture's corner coordinates.
 * @returns A function giving the horizontal and vertical position, each 0 to 1 inside the picture.
 */
export function pictureProjection(corners: FarmPicture['corners']): (longitude: number, latitude: number) => [number, number] {
  const [tl, tr, , bl] = corners
  const ax = tr[0] - tl[0], ay = tr[1] - tl[1], bx = bl[0] - tl[0], by = bl[1] - tl[1], det = ax * by - ay * bx
  return (longitude, latitude) => { const x = longitude - tl[0], y = latitude - tl[1]; return [(x * by - y * bx) / det, (ax * y - ay * x) / det] }
}
