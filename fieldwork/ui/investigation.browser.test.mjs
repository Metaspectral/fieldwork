/** Native investigation journey uses unknowns, familiar file views, local tasks, and the same field context. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const root = resolve(import.meta.dirname, '../..')
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('playwright')
test('an incomplete investigation can inspect yield points, assign work, and retain its sources and history', { timeout: 150000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-investigation-ui-')), artifacts = join(root, '.artifacts/investigation-pages', basename(home))
  const server = fork(join(root, 'apps/cli/src/bin.ts'), ['--profile', 'web', '--patch', 'apps/web/tests/pin-browse-picker.overlay.yml', '--patch', 'fieldwork/plugins/cordis.source.patch.yml', '--no-open', '--port', '0'], { cwd: root, execArgv: ['--import', 'tsx/esm'], env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, silent: true })
  const exited = new Promise(resolve => server.once('exit', resolve)); let browser
  try {
    const launch = await new Promise((resolve, reject) => { let log = ''; const timer = setTimeout(() => reject(new Error('Investigation runtime startup timed out')), 45000); const read = b => { log += b; const m = log.match(/dsh web: (http:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } }; server.stdout.on('data', read); server.stderr.on('data', read); server.once('exit', () => { clearTimeout(timer); reject(new Error('Investigation runtime exited during startup')) }) })
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }), errors = []
    page.on('pageerror', e => errors.push(e.message)); await page.request.get(launch); await page.goto(new URL(launch).origin)
    await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('button', { name: 'Do this later', exact: true }).click()
    await page.getByRole('button', { name: 'Field learning', exact: true }).click(); await page.getByRole('button', { name: 'Add my field', exact: true }).click()
    const confirm = async () => { await page.getByRole('button', { name: 'Confirm and save', exact: true }).click(); await page.waitForFunction(() => !document.querySelector('[role="dialog"]')) }
    await page.getByLabel('Field name', { exact: true }).fill('Historical corn field')
    await page.getByLabel('Area (ha)', { exact: true }).fill('11.7156')
    await page.getByLabel('Why this works for us', { exact: true }).fill('Current practice unknown; preserve the historical evidence.')
    await page.getByRole('button', { name: 'Review this change', exact: true }).click(); await confirm()
    await page.getByLabel('Working season', { exact: true }).fill('')
    await page.getByLabel('Working season', { exact: true }).pressSequentially('2014')
    await page.getByLabel('Working season', { exact: true }).press('Tab')
    await page.getByRole('button', { name: 'Source library', exact: true }).click(); await page.getByRole('button', { name: 'Add an original source', exact: true }).click()
    await page.getByLabel('Source title', { exact: true }).fill('Historical yield worksheet · synthetic test')
    await page.getByLabel('Original URL, author, or document identity', { exact: true }).fill('Synthetic quality fixture')
    await page.getByLabel('Applicable field, season, region, and limitations', { exact: true }).fill('Synthetic points, no treatment or field visit.')
    await page.getByLabel('Original document', { exact: true }).setInputFiles({ name: 'yield.csv', mimeType: 'text/csv', buffer: Buffer.from('X,Y,Yield\n1,1,0\n2,2,20\n3,3,10\n4,4,\n') })
    await page.getByRole('button', { name: 'Review this change', exact: true }).click(); await confirm()
    await page.getByRole('button', { name: 'Inspect and cite', exact: true }).click(); await page.getByRole('button', { name: '20', exact: true }).click()
    await page.getByText("'Sheet1'!C3", { exact: true }).waitFor(); await mkdir(artifacts, { recursive: true }); await page.screenshot({ path: join(artifacts, 'yield-table.png'), animations: 'disabled' }); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Field learning', exact: true }).click(); await page.getByRole('button', { name: 'Start an investigation', exact: true }).click()
    await page.getByLabel('The question you want to answer', { exact: true }).fill('Do low-yield bands recur across corn seasons?')
    await page.getByLabel('Observations, hypotheses and unknowns (Markdown)', { exact: true }).fill('## Observed\nHistorical map only.\n\n## Unknown\nCurrent crop and cause are unknown.')
    await page.getByRole('checkbox', { name: 'Historical yield worksheet · synthetic test', exact: true }).check()
    await page.getByLabel('Historical yield worksheet · synthetic test · Current main crop', { exact: true }).fill('corn')
    await page.getByLabel('Historical yield worksheet · synthetic test · Use this source as', { exact: true }).selectOption('yield')
    await page.getByLabel('Add tasks (one per line)', { exact: true }).fill('Check coordinate system and yield units\nCompare a matched corn season')
    await page.getByRole('button', { name: 'Review this change', exact: true }).click()
    let snapshot = await page.evaluate(() => fetch('/fieldwork-data').then(r => r.json())); assert.equal(snapshot.learning.investigations.length, 0)
    await confirm(); await page.getByText('Current practice is not documented yet.', { exact: true }).waitFor()
    snapshot = await page.evaluate(() => fetch('/fieldwork-data').then(r => r.json())); assert.equal(snapshot.state.cornPlans.length, 0); assert.equal(snapshot.learning.trials.length, 0); assert.equal(snapshot.learning.investigations[0].season, 2014); assert.equal(snapshot.learning.investigations[0].evidence[0].season, 2014)
    await page.getByRole('button', { name: 'Inspect yield points', exact: true }).click(); await page.getByLabel('Yield unit', { exact: true }).selectOption('unknown')
    await page.getByRole('button', { name: 'Review this change', exact: true }).click(); await confirm()
    await page.getByRole('img', { name: 'Imported yield points in their original coordinate space', exact: true }).waitFor()
    await page.screenshot({ path: join(artifacts, 'open-investigation.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Edit investigation', exact: true }).click()
    await page.getByLabel('Check coordinate system and yield units · Owner (optional)', { exact: true }).fill('Farm helper')
    await page.getByLabel('Check coordinate system and yield units · Due date (optional)', { exact: true }).fill('2027-04-01')
    await page.getByRole('button', { name: 'Review this change', exact: true }).click(); await confirm()
    await page.getByRole('checkbox', { name: 'Complete task: Check coordinate system and yield units', exact: true }).click(); await confirm()
    snapshot = await page.evaluate(() => fetch('/fieldwork-data').then(r => r.json())); const investigation = snapshot.learning.investigations[0]
    assert.equal(investigation.tasks[0].done, true); assert.equal(investigation.tasks[0].assignee, 'Farm helper'); assert.equal(investigation.analyses[0].validRows, 3); assert.equal(investigation.analyses[0].missingRows, 1); assert.equal(investigation.analyses[0].minimum, 0)
    await page.getByRole('button', { name: 'My farm', exact: true }).click(); assert.equal(await page.getByLabel('Working season', { exact: true }).inputValue(), '2014'); await page.getByRole('button', { name: 'Field learning', exact: true }).click()
    await page.getByText('Farm helper · 2027-04-01', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Choose a change when ready', exact: true }).click(); await page.getByLabel('Alternative practice', { exact: true }).fill('A farmer-selected change after local design review')
    await page.getByLabel('Current approach', { exact: true }).fill('Farmer-reviewed current practice')
    await page.getByLabel('What will you measure, and how?', { exact: true }).fill('Comparable harvest measurements after design review')
    await page.getByRole('button', { name: 'Review this change', exact: true }).click(); await confirm()
    snapshot = await page.evaluate(() => fetch('/fieldwork-data').then(r => r.json())); assert.equal(snapshot.learning.trials[0].investigationId, investigation.id)
    await page.getByRole('button', { name: 'Experiments', exact: true }).click(); await page.getByText('Linked to an investigation; its baseline and evidence remain available.', { exact: true }).waitFor()
    await page.reload(); await page.getByRole('button', { name: 'Field learning', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('img', { name: 'Imported yield points in their original coordinate space', exact: true }).waitFor()
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', '')); await page.screenshot({ path: join(artifacts, 'investigation-dark.png'), animations: 'disabled' })
    await page.setViewportSize({ width: 800, height: 950 }); await page.screenshot({ path: join(artifacts, 'investigation-constrained.png'), animations: 'disabled' }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
  } finally { await browser?.close(); server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000); await exited; clearTimeout(timer); await rm(home, { recursive: true, force: true }) }
})
