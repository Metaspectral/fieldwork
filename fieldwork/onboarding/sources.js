/**
 * Where the real data comes from. Each function returns data or null.
 * A failed or missing source gives null, which the rules turn into "no reading".
 *
 * These calls send the field's location to the service named. Nothing else is sent.
 */
import { CROP_MAP_NAMES } from './crops.js'

const TIMEOUT_MS = 60_000
/** The crop map answers one point at a time and sometimes stalls, so give up sooner and try once more. */
const CROP_MAP_TIMEOUT_MS = 12_000

/** Sources that need an account or key nobody has set up yet. */
export const NOT_CONNECTED = [
  { what: 'crop greenness', why: 'NASA\'s Harmonized Landsat and Sentinel-2 images need a NASA Earthdata login' },
  { what: 'water the crop used', why: 'OpenET needs an account key' },
  { what: 'the region\'s stored water', why: 'NASA GRACE data needs a NASA Earthdata login' },
  { what: 'fertilizer prices', why: 'USDA price records need a free key' },
]

async function get(fetchImpl, url, signal, init = {}, timeoutMs = TIMEOUT_MS) {
  const response = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`)
  return response
}

/** Latitude and longitude to the crop map's grid (Albers equal-area for the lower 48 states), in metres. */
export function toCropMapGrid(latitude, longitude) {
  const a = 6378137
  const f = 1 / 298.257222101
  const e2 = 2 * f - f * f
  const e = Math.sqrt(e2)
  const rad = Math.PI / 180
  const q = phi => (1 - e2) * (Math.sin(phi) / (1 - e2 * Math.sin(phi) ** 2) - Math.log((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) / (2 * e))
  const m = phi => Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const [p1, p2, p0, l0] = [29.5 * rad, 45.5 * rad, 23 * rad, -96 * rad]
  const n = (m(p1) ** 2 - m(p2) ** 2) / (q(p2) - q(p1))
  const c = m(p1) ** 2 + n * q(p1)
  const rho = phi => a * Math.sqrt(c - n * q(phi)) / n
  const theta = n * (longitude * rad - l0)
  return { x: rho(latitude * rad) * Math.sin(theta), y: rho(p0) - rho(latitude * rad) * Math.cos(theta) }
}

/** Points inside a round field: the centre plus a ring at 60% of the radius. */
export function samplePoints(latitude, longitude, acres, count) {
  const centre = toCropMapGrid(latitude, longitude)
  if (!acres || count <= 1) return [centre]
  const radius = Math.sqrt(acres * 4046.86 / Math.PI) * 0.6
  const ring = Array.from({ length: count - 1 }, (_, i) => {
    const angle = 2 * Math.PI * i / (count - 1)
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) }
  })
  return [centre, ...ring]
}

/** Run tasks a few at a time. */
async function pool(tasks, limit) {
  const results = new Array(tasks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }))
  return results
}

export function createSources(fetchImpl = fetch) {
  return {
    /** County and state from the US Census. Returns { inUS: false } outside the United States. */
    async locate({ latitude, longitude }, signal) {
      const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties,States&format=json`
      const body = await (await get(fetchImpl, url, signal)).json()
      const places = body?.result?.geographies ?? {}
      const county = places.Counties?.[0]?.BASENAME ?? null
      const state = places.States?.[0]?.BASENAME ?? null
      return { inUS: county !== null, county, state }
    },

    /** Soil type, slope, tolerable loss, erodibility and salt from the USDA soil survey. */
    async soil({ latitude, longitude }, signal) {
      const query = `SELECT TOP 1 mu.muname, c.slope_r, c.tfact, h.kwfact, h.kffact, h.ec_r
        FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${Number(longitude)} ${Number(latitude)})') AS m
        JOIN mapunit mu ON mu.mukey = m.mukey
        JOIN component c ON c.mukey = mu.mukey
        LEFT JOIN chorizon h ON h.cokey = c.cokey AND h.hzdept_r = 0
        ORDER BY c.comppct_r DESC`
      const response = await get(fetchImpl, 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, format: 'JSON' }),
      })
      const row = (await response.json())?.Table?.[0]
      if (!row) return null
      const number = value => value === null || value === undefined || value === '' ? null : Number(value)
      const [name, slope, tolerable, wholeSoil, fineSoil, salt] = row
      return { name, slopePercent: number(slope), tolerableLoss: number(tolerable), erodibility: number(wholeSoil) ?? number(fineSoil), salt: number(salt) }
    },

    /** The most common crop inside the field for one year, from the USDA Cropland Data Layer. */
    async cropMap({ latitude, longitude, acres, year, points }, signal) {
      const counts = new Map()
      const values = await pool(samplePoints(latitude, longitude, acres, points).map(({ x, y }) => async () => {
        const url = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${year}&x=${Math.round(x)}&y=${Math.round(y)}`
        for (let tries = 0; tries < 2; tries++) {
          try {
            const text = await (await get(fetchImpl, url, signal, {}, CROP_MAP_TIMEOUT_MS)).text()
            return /category: "([^"]*)"/.exec(text)?.[1] ?? null
          } catch (error) {
            if (signal?.aborted) throw error
          }
        }
        return null
      }), points)
      const found = values.filter(Boolean)
      if (found.length === 0) return null
      for (const name of found) {
        const crop = CROP_MAP_NAMES[name] ?? name.toLowerCase()
        counts.set(crop, (counts.get(crop) ?? 0) + 1)
      }
      const ranked = [...counts].sort((a, b) => b[1] - a[1])
      return { crop: ranked[0][0], share: ranked[0][1] / found.length, secondCrop: ranked[1]?.[0] ?? null }
    },

    /** Daily rain and hottest temperature from NASA POWER. This is for an area about 50 km across, not the field. */
    async weather({ latitude, longitude, firstYear, lastYear }, signal) {
      const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX&community=AG&longitude=${longitude}&latitude=${latitude}&start=${firstYear}0101&end=${lastYear}1231&format=JSON`
      const body = await (await get(fetchImpl, url, signal)).json()
      const rain = body?.properties?.parameter?.PRECTOTCORR
      const hottest = body?.properties?.parameter?.T2M_MAX
      if (!rain || !hottest) return null
      const fill = body.header?.fill_value ?? -999
      const days = Object.keys(rain).sort()
      const clean = value => value === undefined || value === fill ? null : value
      return { start: `${days[0].slice(0, 4)}-${days[0].slice(4, 6)}-${days[0].slice(6, 8)}`, rainMm: days.map(d => clean(rain[d])), tmaxC: days.map(d => clean(hottest[d])) }
    },

    // Not connected yet: see NOT_CONNECTED.
    async greenness() { return null },
    async waterUse() { return null },
    async storedWater() { return null },
    async fertilizerPrice() { return null },
  }
}

/**
 * Fill in whatever is missing from the saved data for a field.
 * `part` is "crops" (fast: just the crop each year) or "all".
 * Returns the reasons for anything that could not be fetched.
 */
export async function gather(field, years, saved, sources, part, settings, signal) {
  const problems = []
  const attempt = async (what, run) => {
    try { return await run() } catch (error) {
      if (signal?.aborted) throw error
      problems.push({ what, why: `could not be reached (${error.message})` })
      return null
    }
  }
  const { latitude, longitude } = field.shape.center

  if (saved.inUS === undefined) {
    const place = await attempt('the county', () => sources.locate({ latitude, longitude }, signal))
    if (place) saved.inUS = place.inUS
  }
  saved.crops ??= {}
  if (saved.inUS === true) {
    const wanted = years.filter(year => !saved.crops[year])
    const found = await pool(wanted.map(year => () =>
      attempt(`the crop map for ${year}`, () => sources.cropMap({ latitude, longitude, acres: field.acres, year, points: settings.crop.samplePoints }, signal))), 5)
    wanted.forEach((year, i) => { if (found[i]) saved.crops[year] = found[i] })
  } else if (saved.inUS === false) {
    problems.push({ what: 'the crop each year', why: 'the crop map only covers the United States, so the farmer must be asked' })
  }
  if (part === 'crops') return problems

  const lastYear = years.at(-1)
  const firstYear = lastYear - settings.climateYears // one extra year, for crops sown the autumn before
  if (!saved.weather || saved.weatherYears?.[0] !== firstYear || saved.weatherYears?.[1] !== lastYear) {
    const weather = await attempt('the weather', () => sources.weather({ latitude, longitude, firstYear, lastYear }, signal))
    if (weather) { saved.weather = weather; saved.weatherYears = [firstYear, lastYear] }
  }
  if (saved.soil === undefined && saved.inUS === true) {
    const soil = await attempt('the soil record', () => sources.soil({ latitude, longitude }, signal))
    if (soil) saved.soil = soil
  }
  for (const key of ['greenness', 'waterUse', 'storedWater', 'fertilizerPrice']) {
    saved[key] ??= await attempt(key, () => sources[key]({ latitude, longitude, years }, signal))
  }
  for (const gap of NOT_CONNECTED) {
    const key = { 'crop greenness': 'greenness', 'water the crop used': 'waterUse', 'the region\'s stored water': 'storedWater', 'fertilizer prices': 'fertilizerPrice' }[gap.what]
    if (saved[key] === null) problems.push(gap)
  }
  return problems
}
