/**
 * Fieldwork onboarding: find the farmer's field and show its history.
 *
 * Registers the field tools and the `farmer-onboarding` skill. Every number
 * comes from this code; the model only explains results and asks questions.
 *
 * A switch (`pretend`, on by default) returns the mockup's invented values.
 * With it off, the tools use real data and send the field's location to
 * NASA POWER, the USDA crop map, the USDA soil survey and the US Census.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HarnessError } from '@deepseek-ai/dsh-error'
import { ToolArgsError, defineTool } from '@deepseek-ai/dsh-tools'
import { CROP_TABLE } from './crops.js'
import { ESTIMATED, NO_READING, PROBLEMS, REGION, SEEN, computeHistory, rankRisks, thirstiestCrop } from './history.js'
import { FIELD, pretendHistory } from './pretend-data.js'
import { SETTINGS } from './settings.js'
import { createSources, gather } from './sources.js'

export const name = 'fieldwork-onboarding'
export const inject = ['tools', 'skills']

/** Expected failures the model can explain to the farmer. */
export class FieldworkError extends HarnessError {
  constructor(message, code) {
    super(message, code)
    this.name = 'FieldworkError'
  }
}

const LEVELS = ['fine', 'watch', 'bad', NO_READING]
const SURE_LABELS = [SEEN, ESTIMATED, REGION]
const CROPS = [...Object.keys(CROP_TABLE), 'fallow', 'other']
const PROBLEM_NAMES = {
  droughtHeat: 'drought and heat',
  water: 'water',
  topsoil: 'topsoil',
  salt: 'salt',
  costs: 'costs',
}
const ASK_NAMES = {
  crops: 'which crop was grown in the years marked unknown',
  irrigated: 'whether the field is irrigated',
  acres: 'how many acres the field is',
}

// ── Saved answers and saved results ──────────────────────────────────────────

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 })
  await rename(temporary, path)
}

/**
 * The farmer's fields, corrections and notes in one JSON file, plus the data
 * gathered for each field in a folder beside it so a second visit is instant.
 * Writes are serialized and atomic.
 */
export class FieldStore {
  #path
  #data
  #pending = Promise.resolve()

  constructor(path, data) {
    this.#path = path
    this.#data = data
  }

  /** Load saved answers. Only a missing file starts empty; a corrupt file fails loudly. */
  static async open(path) {
    const data = await readJson(path) ?? { version: 1, fields: {} }
    if (data?.version !== 1 || typeof data.fields !== 'object') throw new Error(`Unrecognized Fieldwork onboarding file: ${path}`)
    return new FieldStore(path, data)
  }

  /** Detached legacy records for the shared-owner migration. */
  entries() { return structuredClone(this.#data.fields) }

  /** A detached copy of one field's record. */
  field(fieldId) {
    return structuredClone(this.#data.fields[fieldId] ?? { years: {}, notes: [] })
  }

  /** Apply a change to one field's record and save it. */
  update(fieldId, change) {
    const run = this.#pending.then(async () => {
      const next = structuredClone(this.#data)
      next.fields[fieldId] ??= { years: {}, notes: [] }
      change(next.fields[fieldId])
      await writeJson(this.#path, next)
      this.#data = next
      return structuredClone(next.fields[fieldId])
    })
    this.#pending = run.catch(() => undefined)
    return run
  }

  #gatheredPath(fieldId) {
    return join(dirname(this.#path), 'field-data', `${fieldId.replace(/[^\w.-]/g, '_')}.json`)
  }

  /** Data already gathered for a field (crops, weather, soil), or an empty start. */
  async gathered(fieldId) {
    return await readJson(this.#gatheredPath(fieldId)) ?? {}
  }

  saveGathered(fieldId, data) {
    return writeJson(this.#gatheredPath(fieldId), data)
  }
}

// ── Output schemas ───────────────────────────────────────────────────────────

const str = { type: 'string' }
const int = { type: 'integer' }
const num = { type: 'number' }
const bool = { type: 'boolean' }
const req = spec => ({ ...spec, required: true })
const obj = properties => ({ type: 'object', additionalProperties: false, properties })
const arr = items => ({ type: 'array', items })
const nullable = spec => ({ oneOf: [spec, { type: 'null' }] })

const problemSchema = { type: 'string', enum: PROBLEMS }
const levelSchema = { type: 'string', enum: LEVELS }
const sureSchema = nullable({ type: 'string', enum: SURE_LABELS })
const rotationSchema = nullable(obj({ crops: req(arr(str)), repeats: req(bool) }))
const missingSchema = arr(obj({ what: req(str), why: req(str) }))
const askSchema = arr({ type: 'string', enum: Object.keys(ASK_NAMES) })
const markSchema = obj({ level: req(levelSchema), sure: req(sureSchema) })
const yearSchema = obj({
  year: req(int),
  crop: req(str),
  cropSource: req({ type: 'string', enum: ['crop map', 'you told us', 'unknown'] }),
  secondCrop: req(nullable(str)),
  farmerNotes: req(arr(str)),
  marks: req(obj(Object.fromEntries(PROBLEMS.map(p => [p, markSchema])))),
})
const readingSchema = obj({
  name: req(str),
  value: req({ oneOf: [num, str, { type: 'null' }] }),
  unit: req(nullable(str)),
  sure: req(sureSchema),
  comparedWith: req(nullable(obj({ label: req(str), value: req({ oneOf: [num, str] }), unit: req(nullable(str)) }))),
})
const windowSchema = obj({ from: req(nullable(int)), to: req(nullable(int)), years: req(int), badYears: req(int) })

export const schemas = {
  field: obj({
    fieldId: req(str),
    acres: req(nullable(num)),
    county: req(nullable(str)),
    state: req(nullable(str)),
    inUnitedStates: req(bool),
    irrigated: req(nullable(bool)),
    soilType: req(nullable(str)),
    slopePercent: req(nullable(num)),
    shape: req(obj({
      type: req({ type: 'string', enum: ['circle'] }),
      center: req(obj({ latitude: req(num), longitude: req(num) })),
      radiusFeet: req(nullable(num)),
    })),
    askFarmer: req(askSchema),
    pretend: req(bool),
  }),
  history: obj({
    fieldId: req(str),
    part: req({ type: 'string', enum: ['crops', 'all'] }),
    problems: req(arr(problemSchema)),
    years: req(arr(yearSchema)),
    currentRotation: req(rotationSchema),
    fieldNotes: req(arr(str)),
    askFarmer: req(askSchema),
    missing: req(missingSchema),
    windNotCounted: req(bool),
    pretend: req(bool),
  }),
  yearDetail: obj({
    fieldId: req(str),
    year: req(int),
    crop: req(str),
    cropSource: req({ type: 'string', enum: ['crop map', 'you told us', 'unknown'] }),
    problems: req(arr(obj({
      problem: req(problemSchema),
      level: req(levelSchema),
      sure: req(sureSchema),
      readings: req(arr(readingSchema)),
      note: req(nullable(str)),
    }))),
    pretend: req(bool),
  }),
  risks: obj({
    fieldId: req(str),
    risks: req(arr(obj({
      rank: req(int),
      problem: req(problemSchema),
      size: req({ type: 'string', enum: ['high', 'medium', 'low'] }),
      score: req(int),
      regionOnly: req(bool),
      sure: req(sureSchema),
      badYears: req(arr(int)),
      watchYears: req(arr(int)),
      recent: req(windowSchema),
      earlier: req(windowSchema),
    }))),
    headline: req(nullable(obj({
      problem: req(problemSchema),
      recent: req(windowSchema),
      earlier: req(windowSchema),
      thirstiestCrop: req(nullable(str)),
    }))),
    currentRotation: req(rotationSchema),
    missing: req(missingSchema),
    pretend: req(bool),
  }),
  correction: obj({ fieldId: req(str), saved: req(bool), corrected: req(yearSchema) }),
  note: obj({ fieldId: req(str), saved: req(bool), notesSaved: req(int) }),
}

// ── Rendering: the short text the model reads ───────────────────────────────

const PRETEND = 'These are invented demo values.'
const text = lines => [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
const rotationText = r => r ? `${r.crops.join(' → ')}, then it repeats` : 'no repeating pattern found'
const windowText = w => `${w.badYears} of ${w.years} years (${w.from}–${w.to})`
const askText = list => list.length > 0 ? `Ask the farmer: ${list.map(key => ASK_NAMES[key]).join('; ')}.` : ''
const missingText = list => list.length > 0 ? `No reading for: ${list.map(m => `${m.what} (${m.why})`).join('; ')}.` : ''
const cropText = y => `${y.crop}${y.secondCrop ? ` and ${y.secondCrop}` : ''}${y.cropSource === 'you told us' ? ' (you told us)' : ''}`

function renderField(f) {
  const where = f.county ? `${f.county} County, ${f.state}` : 'outside the United States'
  const size = f.acres === null ? 'size not known' : `${f.acres} acres`
  const water = f.irrigated === null ? 'irrigation not known' : f.irrigated ? 'irrigated' : 'not irrigated'
  return text([
    `Found field ${f.fieldId}: ${size}, ${where}, ${water}.`,
    f.soilType ? `Soil: ${f.soilType}${f.slopePercent === null ? '' : `, ${f.slopePercent}% slope`}.` : '',
    askText(f.askFarmer),
    f.pretend ? PRETEND : '',
  ])
}

function renderHistory(value) {
  const sure = value.problems.map(p => {
    const labels = [...new Set(value.years.map(y => y.marks[p].sure).filter(Boolean))]
    return labels.length > 0 ? `${PROBLEM_NAMES[p]}: ${labels.join(' or ')}` : ''
  }).filter(Boolean).join('; ')
  return text([
    value.part === 'crops'
      ? `Field ${value.fieldId}. Crops only so far; call again with part "all" for the problems.`
      : `Field ${value.fieldId}. Each year: crop, then a mark for each problem (fine, watch, bad, or no reading).`,
    ...value.years.map(y => {
      const marks = value.problems.map(p => `${PROBLEM_NAMES[p]} ${y.marks[p].level}`).join(', ')
      const notes = y.farmerNotes.length > 0 ? ` [farmer's note: ${y.farmerNotes.join(' / ')}]` : ''
      return `${y.year} ${cropText(y)}${marks ? `: ${marks}` : ''}${notes}`
    }),
    sure ? `How sure: ${sure}.` : '',
    `Current rotation: ${rotationText(value.currentRotation)}.`,
    value.windNotCounted && value.problems.includes('topsoil') ? 'Topsoil counts soil moved by rain only, not by wind. This is a dry area, so say so.' : '',
    value.fieldNotes.length > 0 ? `Farmer's notes: ${value.fieldNotes.join(' / ')}` : '',
    askText(value.askFarmer),
    missingText(value.missing),
    value.pretend ? PRETEND : '',
  ])
}

function renderYear(value) {
  return text([
    `${value.year}, ${value.crop}${value.cropSource === 'you told us' ? ' (you told us)' : ''}:`,
    ...value.problems.flatMap(p => [
      `- ${PROBLEM_NAMES[p.problem]}: ${p.level}${p.sure ? ` (${p.sure})` : ''}${p.note ? `. ${p.note}` : ''}`,
      ...p.readings.map(r => r.value === null
        ? `    ${r.name}: no reading`
        : `    ${r.name}: ${r.value}${r.unit ? ` ${r.unit}` : ''}${r.comparedWith ? `; ${r.comparedWith.label}: ${r.comparedWith.value}${r.comparedWith.unit ? ` ${r.comparedWith.unit}` : ''}` : ''}`),
    ]),
    value.pretend ? PRETEND : '',
  ])
}

function renderRisks(value) {
  const h = value.headline
  return text([
    h
      ? `Top risk: ${PROBLEM_NAMES[h.problem]}. Bad in ${windowText(h.recent)}, against ${windowText(h.earlier)} before.`
        + (h.thirstiestCrop ? ` The thirstiest crop on this field is ${h.thirstiestCrop}.` : '')
      : 'No problem showed up in the recent years, so there is no top risk.',
    value.risks.length > 0 ? 'All risks, highest first (region-only ones last):' : '',
    ...value.risks.map(r => `${r.rank}. ${PROBLEM_NAMES[r.problem]}: ${r.size} (${r.sure}); bad ${r.badYears.join(', ') || 'never'}; watch ${r.watchYears.join(', ') || 'never'}`),
    `Current rotation: ${rotationText(value.currentRotation)}.`,
    missingText(value.missing),
    value.pretend ? PRETEND : '',
  ])
}

// ── Plugin ───────────────────────────────────────────────────────────────────

const defaultFile = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'fieldwork', 'onboarding.json')

function requireYear(history, year) {
  const entry = history.years.find(y => y.year === year)
  if (!entry) throw new FieldworkError(`No history for ${year}. Years on record: ${history.years[0].year}–${history.years.at(-1).year}.`, 'YEAR_NOT_FOUND')
  return entry
}

function requireText(value, field, max) {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new ToolArgsError([`${field} must not be empty`])
  if (trimmed.length > max) throw new ToolArgsError([`${field} must be at most ${max} characters`])
  return trimmed
}

const yearOut = (y, problems) => ({
  year: y.year,
  crop: y.crop,
  cropSource: y.cropSource,
  secondCrop: y.secondCrop,
  farmerNotes: y.farmerNotes,
  marks: Object.fromEntries(problems.map(p => [p, { level: y.results[p].level, sure: y.results[p].sure }])),
})

/** Read the bundled skill file and split its frontmatter from its body. */
async function loadSkill() {
  const path = fileURLToPath(new URL('./skills/farmer-onboarding/SKILL.md', import.meta.url))
  const source = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
  if (!match) throw new Error(`${path} has no frontmatter`)
  const meta = Object.fromEntries(match[1].split('\n').map(line => /^(\w[\w-]*):\s*(.*)$/.exec(line)).filter(Boolean).map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]))
  return { path, name: meta.name, description: meta.description, content: match[2].trim() }
}

/**
 * @param config.file - where the farmer's answers are saved
 * @param config.pretend - true (default) returns the mockup's invented values
 * @param config.sources - replacement data sources, for tests
 * @param config.earthdataTokenFile - file holding a NASA Earthdata token for field greenness
 * @param config.lastYear - last full year to report, for tests
 */
export async function apply(ctx, config = {}) {
  const pretend = config.pretend ?? process.env.FIELDWORK_PRETEND !== '0'
  const store = config.store ?? await FieldStore.open(config.file ?? defaultFile())
  const sources = config.sources ?? createSources(fetch, { tokenFile: config.earthdataTokenFile })
  const skill = await loadSkill()
  const lastYear = config.lastYear ?? new Date().getUTCFullYear() - 1
  const years = Array.from({ length: SETTINGS.years }, (_, i) => lastYear - SETTINGS.years + 1 + i)

  function requireField(fieldId) {
    const field = pretend ? (fieldId === FIELD.fieldId ? FIELD : undefined) : store.field(fieldId).field
    if (!field) throw new FieldworkError(`No field with id "${fieldId}". Call find_field first.`, 'FIELD_NOT_FOUND')
    return field
  }

  /** The history for a field, fetching whatever has not been saved yet. */
  async function historyOf(fieldId, part, signal) {
    const field = requireField(fieldId)
    const corrections = store.field(fieldId)
    if (pretend) return { ...pretendHistory(corrections), missing: [] }
    const gathered = await store.gathered(fieldId)
    const before = JSON.stringify(gathered)
    const missing = await gather(field, years, gathered, sources, part, SETTINGS, signal)
    if (JSON.stringify(gathered) !== before) await store.saveGathered(fieldId, gathered)
    const history = computeHistory(field, gathered, corrections, years, SETTINGS)
    if (part === 'crops') return { ...history, problems: [], missing }
    // The inherited crop water, fertilizer, soil-loss, and risk thresholds have
    // no regional qualification. Keep the prototype rules out of real decisions.
    for (const year of history.years) for (const problem of history.problems) {
      const result = year.results[problem]
      year.results[problem] = { level: NO_READING, sure: null,
        readings: problem === 'droughtHeat' ? result.readings.map(r => ({ ...r, sure: r.value === null ? null : REGION, comparedWith: null })) : [],
        note: 'Risk classification is unavailable: prototype thresholds and crop constants have not been regionally validated. Weather summaries use an assumed crop calendar and are regional context, not field measurements.' }
    }
    return { ...history, missing: [...missing, { what: 'validated agronomic risk classification', why: 'Prototype water, fertilizer, soil-loss, and risk thresholds are unqualified. No suitability, yield, or risk recommendation is available.' }] }
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow' || !['correct_year', 'save_field_note'].includes(exec.name)) return decision
    return { kind: 'ask', reason: `Save this farmer-confirmed field change: ${JSON.stringify(exec.arguments)}` }
  })

  const runtimeMode = pretend
    ? `\n\n## Current runtime\n\nInvented demo mode only. After the farmer chooses the demo, call find_field with ${JSON.stringify({ latitude: FIELD.shape.center.latitude, longitude: FIELD.shape.center.longitude, acres: FIELD.acres, irrigated: FIELD.irrigated })}. These identify the fictional example, never the farmer's actual field. No location lookup is sent to external services in this mode.`
    : '\n\n## Current runtime\n\nStandalone real-data developer mode. Do not offer a fictional lookup in this mode. Before find_field, explain that coordinates go to the US Census, USDA crop-map host, USDA soil survey, and NASA POWER, and ask for permission and an actual coordinate point. Never guess coordinates from a place name.'
  ctx.skills.register({ ...skill, content: skill.content + runtimeMode, source: 'runtime' })

  ctx.tools.register(defineTool({
    name: 'find_field',
    description: 'Find the farmer\'s field from a point on the map. Returns its id, county, state, soil, slope, and what the farmer still has to be asked. Pass acres and irrigated when the farmer has said them. Ask the farmer to confirm it is their field before using it.',
    parameters: {
      latitude: { type: 'number', required: true, description: 'Latitude of the centre of the field, in degrees' },
      longitude: { type: 'number', required: true, description: 'Longitude of the centre of the field, in degrees' },
      acres: { type: 'number', description: 'Size of the field in acres, if the farmer has said' },
      irrigated: { type: 'boolean', description: 'Whether the field is irrigated, if the farmer has said' },
    },
    output: { schema: schemas.field, render: (_args, value) => renderField(value) },
    async execute(args, exec) {
      const violations = []
      if (args.latitude < -90 || args.latitude > 90) violations.push('latitude must be between -90 and 90')
      if (args.longitude < -180 || args.longitude > 180) violations.push('longitude must be between -180 and 180')
      if (args.acres !== undefined && !(args.acres > 0 && args.acres <= 100000)) violations.push('acres must be between 0 and 100000')
      if (violations.length > 0) throw new ToolArgsError(violations)
      if (pretend) return { ...structuredClone(FIELD), inUnitedStates: true, askFarmer: [], pretend: true }

      const latitude = Math.round(args.latitude * 1e4) / 1e4
      const longitude = Math.round(args.longitude * 1e4) / 1e4
      const fieldId = `field_${latitude}_${longitude}`
      const known = store.field(fieldId).field
      const gathered = await store.gathered(fieldId)
      const attempt = async run => { try { return await run() } catch (error) { if (exec?.signal?.aborted) throw error; return null } }
      const place = gathered.place ?? await attempt(() => sources.locate({ latitude, longitude }, exec?.signal))
      const soil = gathered.soil ?? (place?.inUS ? await attempt(() => sources.soil({ latitude, longitude }, exec?.signal)) : null)
      const acres = args.acres ?? known?.acres ?? null
      const field = {
        fieldId,
        acres,
        county: place?.county ?? null,
        state: place?.state ?? null,
        irrigated: args.irrigated ?? known?.irrigated ?? null,
        soilType: soil?.name ?? null,
        slopePercent: soil?.slopePercent ?? null,
        shape: { type: 'circle', center: { latitude, longitude }, radiusFeet: acres === null ? null : Math.round(Math.sqrt(acres * 43560 / Math.PI)) },
      }
      if (place) { gathered.place = place; gathered.inUS = place.inUS }
      if (soil) gathered.soil = soil
      if (known && known.acres !== acres) delete gathered.crops // the sampled points move with the size
      await store.saveGathered(fieldId, gathered)
      await store.update(fieldId, record => { record.field = field })
      const askFarmer = [...(field.irrigated === null ? ['irrigated'] : []), ...(acres === null ? ['acres'] : [])]
      return { ...field, inUnitedStates: place?.inUS ?? false, askFarmer, pretend: false }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'field_history',
    description: 'Year-by-year history of one field for the last ten full years: the crop each year and a mark (fine, watch, bad, or no reading) with a "how sure" label for each problem that applies, plus the current rotation. Call with part "crops" first for a fast answer, then part "all". Includes the farmer\'s saved corrections.',
    parameters: {
      fieldId: { type: 'string', required: true, description: 'Field id from find_field' },
      part: { type: 'string', enum: ['crops', 'all'], description: '"crops" returns only the crop each year, quickly. "all" (the default) adds the problems.' },
    },
    output: { schema: schemas.history, render: (_args, value) => renderHistory(value) },
    async execute(args, exec) {
      const part = args.part ?? 'all'
      const history = await historyOf(args.fieldId, part, exec?.signal)
      return {
        fieldId: args.fieldId,
        part,
        problems: history.problems,
        years: history.years.map(y => yearOut(y, history.problems)),
        currentRotation: history.rotation,
        fieldNotes: store.field(args.fieldId).notes,
        askFarmer: history.askFarmer,
        missing: history.missing,
        windNotCounted: history.windNotCounted,
        pretend,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'year_detail',
    description: 'The readings behind one year\'s marks on one field: for each problem, its level, each reading with its unit and what it is compared with, a short note, and how sure it is.',
    parameters: {
      fieldId: { type: 'string', required: true, description: 'Field id from find_field' },
      year: { type: 'integer', required: true, description: 'Year to look at, for example 2022' },
    },
    output: { schema: schemas.yearDetail, render: (_args, value) => renderYear(value) },
    async execute(args, exec) {
      const history = await historyOf(args.fieldId, 'all', exec?.signal)
      const year = requireYear(history, args.year)
      return {
        fieldId: args.fieldId,
        year: year.year,
        crop: year.crop,
        cropSource: year.cropSource,
        problems: history.problems.map(problem => ({ problem, ...year.results[problem] })),
        pretend,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'field_risks',
    description: 'The field\'s problems in ranked order, each with its size (high, medium, low) and the years that show it, plus the counts behind the top risk. Problems known only for the region come last. Demo mode only illustrates rankings. Real mode returns no ranked recommendations until regional validation is implemented.',
    parameters: {
      fieldId: { type: 'string', required: true, description: 'Field id from find_field' },
    },
    output: { schema: schemas.risks, render: (_args, value) => renderRisks(value) },
    async execute(args, exec) {
      const history = await historyOf(args.fieldId, 'all', exec?.signal)
      const risks = rankRisks(history, SETTINGS)
      // The headline is the highest-ranked problem that showed up at all in the recent years.
      const top = risks.find(risk => risk.score > 0)
      return {
        fieldId: args.fieldId,
        risks,
        headline: top ? {
          problem: top.problem,
          recent: top.recent,
          earlier: top.earlier,
          thirstiestCrop: top.problem === 'water' ? thirstiestCrop(history.years) : null,
        } : null,
        currentRotation: history.rotation,
        missing: history.missing,
        pretend,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'correct_year',
    description: 'Save the farmer\'s correction to one year of the field history and return the corrected year. Pass the right crop when the crop was wrong or unknown; the saved history is updated; real-mode agronomic classifications remain unavailable. Always pass what was wrong in the farmer\'s own words.',
    parameters: {
      fieldId: { type: 'string', required: true, description: 'Field id from find_field' },
      year: { type: 'integer', required: true, description: 'The year that was wrong' },
      whatWasWrong: { type: 'string', required: true, description: 'What was wrong, in the farmer\'s words' },
      crop: { type: 'string', enum: CROPS, description: 'The crop actually grown that year, if the crop was wrong or unknown' },
    },
    output: {
      schema: schemas.correction,
      render: (_args, value) => text([
        `Saved. ${value.corrected.year} is now ${cropText(value.corrected)}, with the farmer's note: ${value.corrected.farmerNotes.at(-1)}`,
      ]),
    },
    async execute(args, exec) {
      requireField(args.fieldId)
      if (!years.includes(args.year) && !pretend) throw new FieldworkError(`No history for ${args.year}. Years on record: ${years[0]}–${years.at(-1)}.`, 'YEAR_NOT_FOUND')
      if (pretend) requireYear(pretendHistory({}), args.year)
      const note = requireText(args.whatWasWrong, 'whatWasWrong', 1000)
      await store.update(args.fieldId, record => {
        const year = record.years[args.year] ??= { notes: [] }
        if (args.crop !== undefined) year.crop = args.crop
        year.notes.push(note)
      })
      const history = await historyOf(args.fieldId, 'all', exec?.signal)
      return { fieldId: args.fieldId, saved: true, corrected: yearOut(requireYear(history, args.year), history.problems) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'save_field_note',
    description: 'Save something the farmer says the history missed, in their own words.',
    parameters: {
      fieldId: { type: 'string', required: true, description: 'Field id from find_field' },
      note: { type: 'string', required: true, description: 'The farmer\'s words' },
    },
    output: {
      schema: schemas.note,
      render: (_args, value) => text([`Saved. ${value.notesSaved} note(s) on this field.`]),
    },
    async execute(args) {
      requireField(args.fieldId)
      const note = requireText(args.note, 'note', 2000)
      const record = await store.update(args.fieldId, r => { r.notes.push(note) })
      return { fieldId: args.fieldId, saved: true, notesSaved: record.notes.length }
    },
  }))

  console.log(`[fieldwork-onboarding] loaded: 6 tools and the farmer-onboarding skill (${pretend ? 'pretend data' : 'real data'})`)
}
