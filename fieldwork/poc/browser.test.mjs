/** Real Harness composition and browser walkthrough; no model API key required. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
const root = resolve(import.meta.dirname, '../..')
const require = createRequire(join(root, 'apps/web/package.json'))
const { chromium } = require('playwright')

test('farmer workflow runs through the authenticated Harness composition on desktop and phone sizes', { timeout: 120000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'fieldwork-browser-'))
  const server = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'web', '--patch', 'fieldwork/poc/cordis.source.patch.yml', '--no-open', '--port', '0'], { cwd: root, env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let browser
  const exited = new Promise(resolve => server.once('exit', resolve))
  try {
    const launch = await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error('Harness did not become ready')), 45000)
      const consume = data => {
        output += data.toString()
        const match = output.match(/dsh web: (http:\/\/[^\s]+)/)
        if (match) { clearTimeout(timeout); resolve(match[1]) }
      }
      server.stdout.on('data', consume); server.stderr.on('data', consume)
      server.once('exit', () => { clearTimeout(timeout); reject(new Error('Harness exited during startup')) })
    })
    const origin = new URL(launch).origin
    assert.equal((await fetch(`${origin}/fieldwork/api`)).status, 401)
    browser = await chromium.launch({ headless: true, ...(process.env.FIELDWORK_BROWSER_CHANNEL ? { channel: process.env.FIELDWORK_BROWSER_CHANNEL } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const entry = await page.request.get(launch).catch(() => { throw new Error('Authenticated entry request failed; credential omitted.') })
    assert.equal(entry.status(), 200, 'Authenticated entry must serve the built application')
    await page.goto(`${origin}/fieldwork`)
    await page.getByRole('heading', { name: 'A little more knowledge. A better next step.' }).waitFor()
    await mkdir(join(root, '.artifacts/fieldwork-poc'), { recursive: true })
    await page.screenshot({ path: join(root, '.artifacts/fieldwork-poc/desktop.png'), fullPage: true })
    await page.getByRole('button', { name: 'Plug-ins', exact: true }).click()
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Seed cost check' }) }).getByRole('button', { name: 'Try sample' }).click()
    await page.getByText('Sample only · nothing activated or saved').waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    const stateBefore = await page.evaluate(() => fetch('/fieldwork/api').then(r => r.json()))
    assert.ok(!stateBefore.state.active.includes('seed-cost'))
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Seed cost check' }) }).getByRole('button', { name: 'Review activation' }).click()
    await page.getByRole('button', { name: 'Activate this plugin' }).click()
    await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Seed cost check' }) }).getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('button', { name: 'Compare costs', exact: true }).click()
    await page.getByText('CAD 216.00', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'My farm', exact: true }).click()
    await page.getByLabel('Farm name').fill('Alder Creek · test context')
    await page.getByRole('button', { name: 'Save my context' }).click()
    await page.getByText('Farm context saved on this computer.').waitFor()
    await page.getByRole('button', { name: 'Community', exact: true }).click()
    await page.getByRole('button', { name: 'Adapt privately' }).first().click()
    await page.getByRole('button', { name: 'Adapt this draft' }).click()
    await page.getByLabel('Your current approach').fill('Our current barley strip; farmer baseline')
    await page.getByRole('button', { name: 'Save private draft' }).click()
    await page.getByText('Our current barley strip; farmer baseline', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Start observation tracking' }).click()
    await page.getByRole('button', { name: 'Start tracking', exact: true }).click()
    await page.getByRole('button', { name: 'Record an observation' }).click()
    await page.getByLabel('Record a measurement, condition, or deviation.').fill('PRIVATE: wet soil in lower strip; cost CAD 500.')
    await page.getByRole('button', { name: 'Save observation privately' }).click()
    await page.getByRole('button', { name: 'Preview a summary' }).first().click()
    await page.getByRole('button', { name: 'Preview selected summary' }).click()
    assert.ok(!(await page.locator('dialog').innerText()).includes('PRIVATE:'))
    await page.getByRole('button', { name: 'Confirm sharing to local demo feed' }).click()
    await page.getByText('Your local summary', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Remove summary' }).click()
    await page.getByRole('button', { name: 'Experiments', exact: true }).click()
    await page.getByText('PRIVATE: wet soil in lower strip; cost CAD 500.').waitFor()
    await page.reload()
    await page.getByRole('button', { name: 'Experiments', exact: true }).click()
    await page.getByText('PRIVATE: wet soil in lower strip; cost CAD 500.').waitFor()
    await page.getByRole('button', { name: 'Plug-ins', exact: true }).click()
    const planner = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Crop planner' }) })
    await planner.getByRole('button', { name: 'Review activation' }).click()
    await page.getByRole('button', { name: 'Activate this plugin' }).click()
    await planner.getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('button', { name: 'Compare area allocation' }).click()
    await page.getByRole('button', { name: 'Save a private experiment draft' }).click()
    const saved = await page.evaluate(() => fetch('/fieldwork/api').then(r => r.json()))
    assert.equal(saved.state.experiments.length, 2)
    assert.equal(saved.state.runs.length, 2)
    assert.equal(saved.state.farm.crop, 'Spring barley')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(root, '.artifacts/fieldwork-poc/mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Experiments', exact: true }).click()
    await page.getByRole('button', { name: 'Preview a summary' }).first().click()
    assert.ok(await page.locator('dialog').evaluate(el => el.getBoundingClientRect().right <= innerWidth))
    await page.keyboard.press('Escape')
    assert.ok(!(await page.locator('dialog').isVisible()))
    const csrf = await page.evaluate(() => fetch('/fieldwork/api', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }).then(r => r.status))
    assert.equal(csrf, 403)
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(timeout)
    await rm(home, { recursive: true, force: true })
  }
})
