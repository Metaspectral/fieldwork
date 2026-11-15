// Checks for the onboarding tools, run without the harness or the network.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply } from '../index.js'

const FIELD_ID = 'finney-ks-126'
let dir
let count = 0
const freshFile = () => join(dir, `run-${count++}`, "onboarding.json")

/** Load the plugin against a fake context and return its tools and skills by name. */
async function load(config) {
  const tools = new Map()
  const skills = []
  await apply({ tools: { register: def => tools.set(def.name, def) }, skills: { register: s => skills.push(s) } }, { file: freshFile(), pretend: true, ...config })
  return { tools, skills }
}

/** Call a tool the way the harness does and check the value against its declared schema. */
async function call(tools, name, args) {
  const tool = tools.get(name)
  const value = await tool.execute(args, { signal: new AbortController().signal })
  assert.deepEqual(validateJsonSchemaValue(tool.output.schema, value), [], `${name} output matches its schema`)
  const rendered = tool.output.render(args, value)
  assert.equal(rendered[0].type, 'text')
  return { value, text: rendered[0].text }
}

before(async () => { dir = await mkdtemp(join(tmpdir(), 'fieldwork-onboarding-')) })
after(() => rm(dir, { recursive: true, force: true }))

describe('registration', () => {
  test('registers six tools and the skill', async () => {
    const { tools, skills } = await load()
    assert.deepEqual([...tools.keys()].sort(), ['correct_year', 'field_history', 'field_risks', 'find_field', 'save_field_note', 'year_detail'])
    assert.equal(skills.length, 1)
    assert.equal(skills[0].name, 'farmer-onboarding')
    assert.ok(skills[0].description.length > 0)
    assert.match(skills[0].content, /Is this your field\?/)
    assert.doesNotMatch(skills[0].content, /^---/)
  })
})

describe('pretend data matches the handoff', () => {
  test('find_field returns the pretend field whatever point is passed', async () => {
    const { tools } = await load()
    const { value, text } = await call(tools, 'find_field', { latitude: 51.5, longitude: -0.1 })
    assert.equal(value.fieldId, FIELD_ID)
    assert.equal(value.acres, 126)
    assert.equal(value.county, 'Finney')
    assert.equal(value.state, 'Kansas')
    assert.equal(value.irrigated, true)
    assert.equal(value.shape.type, 'circle')
    assert.equal(value.pretend, true)
    assert.match(text, /126 acres, Finney County, Kansas, irrigated/)
    assert.match(text, /invented demo values/)
  })

  test('find_field rejects a point off the globe', async () => {
    const { tools } = await load()
    await assert.rejects(tools.get('find_field').execute({ latitude: 95, longitude: 0 }, {}), { code: 'INVALID_ARGS' })
  })

  test('field_history returns the handoff grid', async () => {
    const { tools } = await load()
    const { value } = await call(tools, 'field_history', { fieldId: FIELD_ID })
    assert.deepEqual(value.problems, ['droughtHeat', 'water', 'topsoil', 'salt', 'costs'])
    assert.deepEqual(value.years.map(y => y.year), [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    assert.deepEqual(value.years.map(y => y.crop), ['corn', 'corn', 'soybean', 'corn', 'corn', 'soybean', 'corn', 'corn', 'soybean', 'corn'])
    const letters = value.years.map(y => value.problems.map(p => y.marks[p].level[0].toUpperCase()).join(''))
    assert.deepEqual(letters, ['FWFFF', 'FWWFF', 'WWFFF', 'FFFFF', 'BBWFF', 'WWFFW', 'BBWFB', 'BBBFB', 'WBWFW', 'FWFFW'])
    assert.deepEqual(value.years[6].marks.topsoil, { level: 'watch', sure: 'estimated for your field' })
    assert.deepEqual(value.currentRotation, { crops: ['corn', 'corn', 'soybean'], repeats: true })
  })

  test('field_history rejects an unknown field', async () => {
    const { tools } = await load()
    await assert.rejects(tools.get('field_history').execute({ fieldId: 'nope' }, {}), { code: 'FIELD_NOT_FOUND' })
  })

  test('year_detail returns the 2022 readings, each with a unit', async () => {
    const { tools } = await load()
    const { value, text } = await call(tools, 'year_detail', { fieldId: FIELD_ID, year: 2022 })
    const by = Object.fromEntries(value.problems.map(p => [p.problem, p]))
    assert.equal(by.droughtHeat.level, 'bad')
    assert.deepEqual(by.droughtHeat.readings[0], { name: 'season rain', value: 9, unit: 'inches', sure: 'seen on your field', comparedWith: { label: 'usual', value: 16, unit: 'inches' } })
    assert.equal(by.droughtHeat.readings[1].value, 41)
    assert.equal(by.water.readings[0].value, 24)
    assert.equal(by.topsoil.readings[0].value, 6.4)
    assert.equal(by.salt.readings[0].value, 'low')
    assert.equal(by.costs.readings[0].value, 171)
    assert.equal(by.costs.sure, 'true for your region')
    // The two claims the listed sources cannot support are gone.
    assert.doesNotMatch(text, /2\.1 feet|[Mm]ostly wind/)
  })

  test('year_detail rejects a year outside the history', async () => {
    const { tools } = await load()
    await assert.rejects(tools.get('year_detail').execute({ fieldId: FIELD_ID, year: 1990 }, {}), { code: 'YEAR_NOT_FOUND' })
  })

  test('field_risks ranks water first, region-only problems last', async () => {
    const { tools } = await load()
    const { value, text } = await call(tools, 'field_risks', { fieldId: FIELD_ID })
    assert.deepEqual(value.risks.map(r => [r.problem, r.score, r.size, r.regionOnly]), [
      ['water', 8, 'high', false],
      ['droughtHeat', 6, 'high', false],
      ['topsoil', 4, 'medium', false],
      ['costs', 7, 'high', true],
      ['salt', 0, 'low', true],
    ])
    assert.deepEqual(value.risks[0].badYears, [2020, 2022, 2023, 2024])
    assert.deepEqual(value.headline.recent, { from: 2021, to: 2025, years: 5, badYears: 3 })
    assert.deepEqual(value.headline.earlier, { from: 2016, to: 2020, years: 5, badYears: 1 })
    assert.equal(value.headline.thirstiestCrop, 'corn')
    assert.match(text, /Bad in 3 of 5 years \(2021–2025\), against 1 of 5 years \(2016–2020\)/)
  })
})

describe('corrections and notes', () => {
  test('saves a correction to the file, marks it "you told us", and reads it back', async () => {
    const file = freshFile()
    const { tools } = await load({ file })
    const { value, text } = await call(tools, 'correct_year', { fieldId: FIELD_ID, year: 2018, whatWasWrong: 'We grew wheat that year, not soybeans.', crop: 'wheat' })
    assert.equal(value.saved, true)
    assert.equal(value.corrected.crop, 'wheat')
    assert.equal(value.corrected.cropSource, 'you told us')
    assert.deepEqual(value.corrected.farmerNotes, ['We grew wheat that year, not soybeans.'])
    assert.match(text, /you told us/)

    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(saved.fields[FIELD_ID].years['2018'].crop, 'wheat')

    const reloaded = await load({ file })
    const history = await call(reloaded.tools, 'field_history', { fieldId: FIELD_ID })
    assert.equal(history.value.years.find(y => y.year === 2018).crop, 'wheat')
  })

  test('a note without a crop keeps the crop and the crop map as its source', async () => {
    const { tools } = await load()
    const { value } = await call(tools, 'correct_year', { fieldId: FIELD_ID, year: 2020, whatWasWrong: 'Hail took half of it, not drought.' })
    assert.equal(value.corrected.crop, 'corn')
    assert.equal(value.corrected.cropSource, 'crop map')
  })

  test('rejects an empty correction', async () => {
    const { tools } = await load()
    await assert.rejects(tools.get('correct_year').execute({ fieldId: FIELD_ID, year: 2020, whatWasWrong: '   ' }, {}), { code: 'INVALID_ARGS' })
  })

  test('saves a field note and shows it in the history', async () => {
    const { tools } = await load()
    const { value } = await call(tools, 'save_field_note', { fieldId: FIELD_ID, note: 'The northwest corner floods some springs.' })
    assert.equal(value.notesSaved, 1)
    const history = await call(tools, 'field_history', { fieldId: FIELD_ID })
    assert.deepEqual(history.value.fieldNotes, ['The northwest corner floods some springs.'])
  })

  test('refuses to start over a corrupt file', async () => {
    const file = freshFile()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, '{ not json')
    await assert.rejects(load({ file }), SyntaxError)
  })
})

// ── Real-data path, with stand-in sources ────────────────────────────────────

/** Daily weather 1995–2025: 2 mm of rain and 30°C every day, except where a test says otherwise. */
function fakeWeather(change = () => ({})) {
  const rainMm = []
  const tmaxC = []
  for (const day = new Date('1995-01-01T00:00:00Z'); day.getUTCFullYear() <= 2025; day.setUTCDate(day.getUTCDate() + 1)) {
    const { rain = 2, hottest = 30 } = change(day.getUTCFullYear(), day.getUTCMonth() + 1)
    rainMm.push(rain)
    tmaxC.push(hottest)
  }
  return { start: '1995-01-01', rainMm, tmaxC }
}

/** 2022 is dry and hot; 2021 is only dry. */
const dryYears = (year, month) => year === 2022 ? { rain: 1, hottest: month === 7 ? 38 : 30 } : year === 2021 ? { rain: 1.4 } : {}

function fakeSources(overrides = {}) {
  const calls = { locate: 0, soil: 0, cropMap: 0, weather: 0 }
  const months = {}
  for (let y = 1995; y <= 2025; y++) for (let m = 1; m <= 12; m++) months[`${y}-${m}`] = 4
  const sources = {
    locate: async () => { calls.locate++; return { inUS: true, county: 'Finney', state: 'Kansas' } },
    soil: async () => { calls.soil++; return { name: 'Test loam', slopePercent: 6, tolerableLoss: 2, erodibility: 0.4, salt: 3 } },
    cropMap: async () => { calls.cropMap++; return { crop: 'corn', share: 1, secondCrop: null } },
    weather: async () => { calls.weather++; return fakeWeather(dryYears) },
    greenness: async () => null,
    waterUse: async () => months,
    storedWater: async () => Object.fromEntries([[2022, -3], [2021, 1]]),
    fertilizerPrice: async () => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [2016 + i, 0.5 + i * 0.01])),
    ...overrides,
  }
  return { sources, calls }
}

async function realField(overrides, fieldArgs = {}) {
  const { sources, calls } = fakeSources(overrides)
  const { tools } = await load({ pretend: false, sources, lastYear: 2025 })
  const { value: field } = await call(tools, 'find_field', { latitude: 38.05, longitude: -100.95, acres: 126, irrigated: true, ...fieldArgs })
  return { tools, calls, field }
}

describe('real data path', () => {
  test('find_field reports county and soil, and asks for what it cannot know', async () => {
    const { sources } = fakeSources()
    const { tools } = await load({ pretend: false, sources, lastYear: 2025 })
    const { value } = await call(tools, 'find_field', { latitude: 38.05, longitude: -100.95 })
    assert.equal(value.county, 'Finney')
    assert.equal(value.soilType, 'Test loam')
    assert.equal(value.slopePercent, 6)
    assert.equal(value.acres, null)
    assert.equal(value.irrigated, null)
    assert.deepEqual(value.askFarmer, ['irrigated', 'acres'])
    assert.equal(value.pretend, false)
  })

  test('crops come back first without waiting on the weather', async () => {
    const { tools, calls, field } = await realField()
    const { value } = await call(tools, 'field_history', { fieldId: field.fieldId, part: 'crops' })
    assert.equal(value.part, 'crops')
    assert.deepEqual(value.problems, [])
    assert.deepEqual(value.years.map(y => y.crop), Array(10).fill('corn'))
    assert.deepEqual(value.currentRotation, { crops: ['corn'], repeats: true })
    assert.equal(calls.weather, 0)
    assert.equal(calls.cropMap, 10)
  })

  test('a second visit fetches nothing', async () => {
    const { tools, calls, field } = await realField()
    await call(tools, 'field_history', { fieldId: field.fieldId })
    const after = { ...calls }
    await call(tools, 'field_history', { fieldId: field.fieldId })
    await call(tools, 'field_risks', { fieldId: field.fieldId })
    assert.deepEqual(calls, after)
    assert.equal(calls.weather, 1)
  })

  test('a year with no images still gets a weather-only result', async () => {
    const { tools, field } = await realField()
    const history = await call(tools, 'field_history', { fieldId: field.fieldId })
    const mark = year => history.value.years.find(y => y.year === year).marks.droughtHeat
    assert.deepEqual(mark(2022), { level: 'bad', sure: 'true for your region' })
    assert.deepEqual(mark(2021), { level: 'watch', sure: 'true for your region' })
    assert.deepEqual(mark(2019), { level: 'fine', sure: 'true for your region' })
    const detail = await call(tools, 'year_detail', { fieldId: field.fieldId, year: 2022 })
    const readings = detail.value.problems.find(p => p.problem === 'droughtHeat').readings
    assert.equal(readings.find(r => r.name.startsWith('crop greenness')).value, null)
    assert.equal(readings.find(r => r.name === 'hot days').value, 31)
    assert.equal(readings.find(r => r.name === 'season rain').comparedWith.label, '30-year average')
    assert.match(detail.text, /crop greenness at its peak: no reading/)
  })

  test('a rain-fed field returns three problems, not five', async () => {
    const { tools, field } = await realField({}, { irrigated: false })
    const { value } = await call(tools, 'field_history', { fieldId: field.fieldId })
    assert.deepEqual(value.problems, ['droughtHeat', 'topsoil', 'costs'])
    assert.deepEqual(Object.keys(value.years[0].marks), ['droughtHeat', 'topsoil', 'costs'])
  })

  test('salt applies only where it is irrigated and dry', async () => {
    const wet = await realField()
    assert.ok(!(await call(wet.tools, 'field_history', { fieldId: wet.field.fieldId })).value.problems.includes('salt'))
    const dry = await realField({ weather: async () => fakeWeather(() => ({ rain: 1 })) })
    const { value } = await call(dry.tools, 'field_history', { fieldId: dry.field.fieldId })
    assert.ok(value.problems.includes('salt'))
    assert.equal(value.years[0].marks.salt.level, 'watch')
    assert.equal(value.windNotCounted, true)
  })

  test('a field outside the United States returns unknown crops and the ask-the-farmer flag', async () => {
    const { tools, field } = await realField({ locate: async () => ({ inUS: false, county: null, state: null }) })
    assert.equal(field.inUnitedStates, false)
    const { value, text } = await call(tools, 'field_history', { fieldId: field.fieldId })
    assert.ok(value.years.every(y => y.crop === 'unknown' && y.cropSource === 'unknown'))
    assert.ok(value.askFarmer.includes('crops'))
    assert.equal(value.currentRotation, null)
    assert.match(text, /Ask the farmer: which crop was grown/)
  })

  test('a corrected crop changes that year\'s water, topsoil and costs', async () => {
    const { tools, field } = await realField()
    const readings = async () => {
      const { value } = await call(tools, 'year_detail', { fieldId: field.fieldId, year: 2019 })
      return Object.fromEntries(value.problems.map(p => [p.problem, p.readings[0]?.value]))
    }
    const before = await readings()
    const { value } = await call(tools, 'correct_year', { fieldId: field.fieldId, year: 2019, whatWasWrong: 'That was alfalfa.', crop: 'alfalfa' })
    assert.equal(value.corrected.cropSource, 'you told us')
    const after = await readings()
    for (const problem of ['water', 'topsoil', 'costs']) {
      assert.equal(typeof before[problem], 'number', `${problem} had a reading`)
      assert.notEqual(after[problem], before[problem], `${problem} was worked out again`)
    }
    assert.equal(before.topsoil > 2, true)
    assert.equal(after.topsoil < 1, true)
  })

  test('a source that fails gives "no reading", never a guess', async () => {
    const { tools, field } = await realField({ weather: async () => { throw new Error('offline') }, fertilizerPrice: async () => null })
    const { value, text } = await call(tools, 'field_history', { fieldId: field.fieldId })
    assert.ok(value.years.every(y => y.marks.droughtHeat.level === 'no reading' && y.marks.droughtHeat.sure === null))
    assert.ok(value.years.every(y => y.marks.costs.level === 'no reading'))
    assert.ok(value.missing.some(m => m.what === 'the weather'))
    assert.match(text, /No reading for: the weather/)
    const risks = await call(tools, 'field_risks', { fieldId: field.fieldId })
    assert.ok(!risks.value.risks.some(r => r.problem === 'droughtHeat' || r.problem === 'costs'))
  })

  test('under 60% of the field reports the top two crops', async () => {
    const { tools, field } = await realField({ cropMap: async () => ({ crop: 'corn', share: 0.55, secondCrop: 'sorghum' }) })
    const { value, text } = await call(tools, 'field_history', { fieldId: field.fieldId, part: 'crops' })
    assert.equal(value.years[0].secondCrop, 'sorghum')
    assert.match(text, /corn and sorghum/)
  })
})
