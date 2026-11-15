/** Native end-to-end: load the fictional rotation example, accept it, then compare rotations on an own field, load the Brookings example and see it on the farm map. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('playwright')
test('rotation table, compare dialog and plan acceptance complete a native farmer workflow', { timeout: 120000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-rotation-ui-'))
  const artifactDir = process.env.FIELDWORK_ROTATION_SHOTS ?? join(root, '.artifacts/rotation-pages', basename(home))
  const server = fork(join(root, 'apps/cli/src/bin.ts'), ['--profile', 'web', '--patch', 'fieldwork/plugins/cordis.source.patch.yml', '--no-open', '--port', '0'], { cwd: root, execArgv: ['--import', 'tsx/esm'], env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, silent: true })
  const exited = new Promise(resolve => server.once('exit', resolve))
  let browser
  try {
    const launch = await new Promise((resolve, reject) => {
      let log = ''; const timer = setTimeout(() => reject(new Error('Startup timed out')), 45000)
      const read = b => { log += b; const m = log.match(/dsh web: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } }
      server.stdout.on('data', read); server.stderr.on('data', read)
      server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited during startup')) })
    })
    browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, headless: true } : { channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', locale: 'en-US' })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    const snapshot = () => page.evaluate(() => fetch('/fieldwork-data').then(r => r.json()))
    const confirm = async () => { await page.getByRole('button', { name: 'Confirm and save', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('[role="dialog"]')) }
    const shot = async name => { await mkdir(artifactDir, { recursive: true }); await page.screenshot({ animations: 'disabled', path: join(artifactDir, name) }) }
    await page.request.get(launch)
    await page.goto(new URL(launch).origin)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Do this later', exact: true }).click()
    await page.getByRole('button', { name: 'Rotation', exact: true }).click()
    await page.getByRole('heading', { level: 1, name: 'Rotation', exact: true }).waitFor()
    await shot('1-empty.png')
    await page.getByRole('button', { name: 'Try the fictional rotation example', exact: true }).click()
    assert.equal((await snapshot()).state.rotationPlans.length, 0, 'review does not load the example')
    await confirm()
    const season = new Date().getUTCFullYear() + 1
    const home160 = page.getByRole('row', { name: /Home quarter · fictional demo/ })
    await home160.getByText('Not set', { exact: true }).waitFor()
    assert.match(await home160.innerText(), /160\s+Corn\s+Soybean\s+Corn\s+—/)
    await page.getByText('Difference (compared minus current)', { exact: true }).waitFor()
    await shot('2-example-proposed.png')
    await page.getByRole('button', { name: 'Review and accept', exact: true }).click()
    await shot('3-review-accept.png')
    await confirm()
    let state = (await snapshot()).state
    assert.equal(state.rotationPlans[0].status, 'accepted')
    assert.deepEqual(state.rotationPlans[0].calculation.difference, { perAcre: -36, wholeField: -5760 })
    assert.match(await home160.innerText(), /Corn\s+Soybean\s+Corn\s+Soybean\s+Corn–soybean\s+Published study/)
    await shot('4-example-accepted.png')

    await page.getByRole('button', { name: 'Add a field', exact: true }).click()
    await page.getByLabel('Field name', { exact: true }).fill('River field')
    await page.getByLabel('Area (acres)', { exact: true }).fill('100')
    await page.getByRole('dialog').getByRole('button', { name: 'Review', exact: true }).click()
    await confirm()
    const river = page.getByRole('row', { name: /River field/ })
    await river.getByRole('button', { name: 'Edit crops', exact: true }).click()
    await page.getByLabel(String(season - 1), { exact: true }).selectOption({ label: 'Corn' })
    await page.getByRole('dialog').getByRole('button', { name: 'Review', exact: true }).click()
    await confirm()
    state = (await snapshot()).state
    assert.equal(state.fields.find(f => f.name === 'River field').years[season - 1].crop, 'corn')

    await river.getByRole('button', { name: 'Compare rotations', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const options = await dialog.getByLabel('Rotation you run now', { exact: true }).locator('optgroup').first().locator('option').allInnerTexts()
    assert.equal(options.length, 6, 'all six study rotations are offered')
    await dialog.getByLabel('Rotation you run now', { exact: true }).selectOption('cs')
    await dialog.getByText(/Bansal, Wang and Osborne 2024.*doi:10\.1002\/agj2\.21688/).first().waitFor()
    await dialog.getByLabel('Rotation to compare', { exact: true }).selectOption('cowws')
    await dialog.getByLabel('Land cost per acre (rent or ownership)', { exact: true }).fill('230')
    const fill = async (side, column, values) => { for (const [row, value] of Object.entries(values)) await dialog.getByLabel(`${side} · ${column} · ${row}`, { exact: true }).fill(String(value)) }
    await fill('Rotation you run now', '1 Corn', { Yield: 180, 'Price per unit': 4.2, 'Costs before land': 500 })
    await fill('Rotation you run now', '2 Soybean', { Yield: 55, 'Price per unit': 10.8, 'Costs before land': 305 })
    await fill('Rotation to compare', '1 Corn', { Yield: 180, 'Price per unit': 4.2, 'Costs before land': 500 })
    await fill('Rotation to compare', '2 Oats', { Yield: 90, 'Price per unit': 3.5, 'Other income': 20, 'Costs before land': 145 })
    await fill('Rotation to compare', '3 Winter wheat', { Yield: 60, 'Price per unit': 6, 'Other income': 30, 'Costs before land': 179 })
    await dialog.getByText('Not calculated, a number is missing', { exact: true }).first().waitFor()
    await fill('Rotation to compare', '4 Soybean', { Yield: 55, 'Price per unit': 10.8, 'Costs before land': 305 })
    await dialog.getByText('-$36.00', { exact: true }).waitFor()
    assert.equal(await dialog.getByLabel('Crop on this field in', { exact: true }).inputValue(), '1', 'soybean follows last season’s corn')
    await dialog.getByLabel('Why this decision', { exact: true }).fill('Keep corn–soybean for now; small grains do not pay at my prices.')
    await shot('5-compare-dialog.png')
    await dialog.getByRole('button', { name: 'Review', exact: true }).click()
    await shot('6-review-proposal.png')
    assert.equal((await snapshot()).state.rotationPlans.length, 1, 'review does not save')
    await confirm()
    await page.getByRole('button', { name: 'Review and accept', exact: true }).click()
    await confirm()
    state = (await snapshot()).state
    const plan = state.rotationPlans.find(p => p.fieldId === state.fields.find(f => f.name === 'River field').id)
    assert.equal(plan.status, 'accepted'); assert.equal(plan.evidence, 'farmer-reported')
    assert.equal(plan.calculation.current.perAcre, 42.5); assert.equal(plan.calculation.alternative.perAcre, 6.5)
    assert.equal(plan.calculation.current.wholeField, 4250)
    assert.equal(plan.inputs.current.source.doi, '10.1002/agj2.21688')
    assert.match(await river.innerText(), /100\s+—\s+—\s+Corn\s+Soybean\s+Corn–soybean/)
    await page.setViewportSize({ width: 1440, height: 2300 })
    await shot('7-own-field-accepted.png')
    await page.getByRole('button', { name: 'Load the Brookings example', exact: true }).click()
    await page.getByText(/Nobody has confirmed them as their fields/).waitFor()
    assert.equal((await snapshot()).state.fields.length, 4, 'review does not load the example')
    await confirm()
    await page.getByRole('row', { name: /West strip · Brookings example/ }).getByText('Soybean', { exact: true }).first().waitFor()
    assert.equal(await page.getByRole('button', { name: 'Load the Brookings example', exact: true }).count(), 0, 'the example loads once')
    state = (await snapshot()).state
    assert.deepEqual(state.fields.slice(4).map(f => f.geometry.type), ['Polygon', 'Polygon', 'Polygon', 'Point'])
    await shot('8-brookings-example.png')
    await page.getByRole('button', { name: 'My farm', exact: true }).click()
    const map = page.getByRole('img', { name: /Map of the located fields/ })
    await map.getByText('West strip', { exact: true }).waitFor()
    await map.getByText('2025 · Soybean', { exact: true }).waitFor()
    await map.getByText('2025 · USDA class: Grass or pasture', { exact: true }).waitFor()
    await map.getByText('Study site', { exact: true }).waitFor()
    assert.equal(await map.locator('polygon').count(), 3)
    await page.getByText('No satellite picture yet. Outlines are drawn on a plain background.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Get satellite picture', exact: true }).click()
    await page.getByText(/Nothing is uploaded and your records stay unchanged/).waitFor()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await map.scrollIntoViewIfNeeded()
    await shot('9-farm-map.png')
    await page.getByRole('button', { name: 'Open rotation', exact: true }).click()
    await page.getByRole('heading', { level: 1, name: 'Rotation', exact: true }).waitFor()
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    server.kill('SIGTERM'); await exited
    await rm(home, { recursive: true, force: true })
  }
})
