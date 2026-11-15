/** Domain checks cover migration, originals, evidence gates, budgets, and immutable revisions. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FarmRecords } from './records.ts'
import { cornCalculation } from './domain.ts'
import { extractSource } from './sources.ts'
import { loadCornDemo } from './corn-demo.ts'
import { acceptCorn, proposeCorn, observeCorn } from './planning.ts'
const metadata = { title: 'Farmer baseline', origin: 'Farmer workbook', evidence: 'farmer-reported' as const, scope: 'This field and season only', filename: 'baseline.csv' }
test('v1 migration preserves original bytes, farm baseline, and prior trials', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-migration-'))
  try {
    const file = join(home, 'records.json')
    const { fields: _f, sources: _s, cornPlans: _p, ...old } = FarmRecords.open(file).snapshot()
    const bytes = JSON.stringify({ ...old, version: 1 })
    await writeFile(file, bytes)
    const records = FarmRecords.open(file)
    assert.equal(await readFile(file + '.v1.backup', 'utf8'), bytes)
    assert.equal(await readFile(file, 'utf8'), bytes, 'opening does not replace original')
    await records.change(s => { s.farm.name = 'Confirmed farmer name' })
    assert.equal(FarmRecords.open(file).snapshot().version, 2)
    assert.equal(await readFile(file + '.v1.backup', 'utf8'), bytes)
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('budget uses combined establishment, exact area units, and whole bag counts', () => {
  const input = { areaHa: 4.0468564224, trialAreaHa: 4.0468564224, baselineSeedsPerAcre: 32000, targetPlantsPerAcre: 35000, establishmentFraction: .95, seedsPerBag: 80000, pricePerBag: 300, currency: 'USD' as const }
  const result = cornCalculation(input)
  assert.equal(result.alternativeSeedsPerAcre, 36843)
  assert.equal(result.baseline.seeds, 320000)
  assert.equal(result.baseline.wholeBags, 4)
  assert.equal(result.trial.wholeBags, 5)
  assert.equal(result.trial.purchaseCost, 1500)
  assert.equal(result.trial.leftoverSeeds, 31570)
  assert.throws(() => cornCalculation({ ...input, establishmentFraction: 0 }))
  assert.throws(() => cornCalculation({ ...input, trialAreaHa: 10 }))
  assert.throws(() => cornCalculation({ ...input, pricePerBag: 1.005 }))
  assert.throws(() => cornCalculation({ ...input, areaHa: 100000, seedsPerBag: 1, pricePerBag: 1000000 }), /exact currency range/)
})
test('catalog keeps original bytes and attributable cells; HTML scripts stay inert', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-source-'))
  try {
    const records = FarmRecords.open(join(home, 'records.json'))
    const bytes = Buffer.from('Practice,Seeds per acre\nCurrent,32000\n')
    const source = await records.importSource(bytes, metadata)
    assert.deepEqual(await records.original(source.id), bytes)
    assert.ok(source.sections.some(s => s.locator === "'Sheet1'!B2" && s.text.includes('32000')))
    const html = await extractSource(Buffer.from('<h1>Farmer blog</h1><script>throw Error("DO NOT RUN")</script><p>Wait for workable soil.</p>'), { ...metadata, filename: 'blog.html' })
    assert.ok(html.sections.some(s => s.text.includes('Wait for workable soil')))
    assert.ok(!JSON.stringify(html.sections).includes('DO NOT RUN'))
    await assert.rejects(records.original('missing'), /not found/)
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('accepted corn decisions preserve revisions, cite evidence, and retain observations', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-corn-'))
  try {
    const records = FarmRecords.open(join(home, 'records.json'))
    const { id } = await loadCornDemo(records)
    const original = records.snapshot().cornPlans[0]!
    await acceptCorn(records, id)
    await observeCorn(records, { id, date: '2026-11-14', text: 'Invented stand count for demonstration; no yield measurement.', evidence: 'demo' })
    const proposal = { ...original, supersedes: id, baselineReason: 'Retain the baseline because the first comparison was inconclusive.' }
    const next = await proposeCorn(records, proposal)
    assert.equal(records.snapshot().cornPlans.find(p => p.id === id)!.observations.length, 1)
    assert.equal(records.snapshot().cornPlans.find(p => p.id === next.id)!.revision, 2)
    await assert.rejects(acceptCorn(records, id), /proposed/)
    await assert.rejects(proposeCorn(records, { ...proposal, citations: [{ sourceId: 'missing', locator: 'A1' }] }), /Citation not found/)
    await records.change(s => { s.fields[0]!.evidence = 'farmer-reported' })
    await assert.rejects(acceptCorn(records, next.id), /demo inputs/)
    assert.equal(FarmRecords.open(join(home, 'records.json')).snapshot().cornPlans.length, 2)
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('XLSX formulas retain their original cached values without recalculation', async () => {
  const bytes = await readFile(new URL('../../packages/client/ui-sidebar-documentpreview/tests/fixtures/excel-xml/strings-path.xlsx', import.meta.url))
  const source = await extractSource(bytes, { ...metadata, filename: 'existing-fixture.xlsx' })
  const formula = source.sections.find(s => s.text.includes('SUM(B2:B3)'))
  assert.ok(formula)
  const cell = JSON.parse(formula.text)
  assert.equal(cell.formula, 'SUM(B2:B3)')
  assert.equal(cell.value, 57)
  assert.match(cell.calculation, /not recalculated/)
})
test('PDF pages extract into stable locators without executing document actions', async () => {
  const stream = 'BT /F1 12 Tf 40 100 Td (Farmer corn baseline) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const source = await extractSource(Buffer.from(pdf), { ...metadata, filename: 'fixture.pdf' })
  assert.equal(source.sections[0]!.locator, 'page 1')
  assert.match(source.sections[0]!.text, /Farmer corn baseline/)
})
test('acceptance distinguishes missing and uncited regional inputs from farmer assumptions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-evidence-'))
  try {
    const records = FarmRecords.open(join(home, 'records.json'))
    const { id } = await loadCornDemo(records)
    await records.change(s => { s.cornPlans[0]!.assumptions[0]!.evidence = 'missing' })
    await assert.rejects(acceptCorn(records, id), /missing planning inputs/)
    await records.change(s => { const a = s.cornPlans[0]!.assumptions[0]!; a.evidence = 'regional'; delete a.citation })
    await assert.rejects(acceptCorn(records, id), /need a source citation/)
    await records.change(s => { s.cornPlans[0]!.assumptions[0]!.evidence = 'assumed' })
    await acceptCorn(records, id)
    assert.equal(records.snapshot().cornPlans[0]!.status, 'accepted')
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('private and credentialed URL captures are rejected before an HTTP request', async () => {
  const { captureUrl, publicCaptureUrl } = await import('./capture.ts')
  assert.throws(() => publicCaptureUrl('http://example.com'), /public HTTPS/)
  assert.throws(() => publicCaptureUrl('https://user:password@example.com'), /without credentials/)
  assert.throws(() => publicCaptureUrl('https://example.com:8443'), /443/)
  await assert.rejects(captureUrl('https://127.0.0.1/'), /publicly reachable/)
  await assert.rejects(captureUrl('https://169.254.169.254/'), /publicly reachable/)
})
