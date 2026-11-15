/** Real native Harness panels: private records, explicit review, and local sharing. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root=resolve(import.meta.dirname,'../..')
const {chromium}=createRequire(join(root,'apps/web/package.json'))('playwright')
for (const provided of [false, true]) test(`built-in setup with ${provided ? 'provided' : 'user-selected'} model starts once and resumes across tabs`, {timeout:120000}, async()=>{
 const home=await mkdtemp(join(tmpdir(),'fieldwork-ui-'))
 const logFile=join(home,'model-calls.txt')
 await writeFile(logFile,'')
 const overlay=join(home,'model.yml')
 await writeFile(overlay,`- insert:\n    - id: onboarding-browser-model\n      name: ${JSON.stringify(join(root,'fieldwork/ui/onboarding-model-fixture.mjs'))}\n      config:\n        log: ${JSON.stringify(logFile)}\n`)
 const server=fork(join(root,'apps/cli/src/bin.ts'),['--profile','web','--patch','fieldwork/plugins/cordis.source.patch.yml','--patch',overlay,'--no-open','--port','0'],{cwd:root,execArgv:['--import','tsx/esm'],env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'},silent:true})
 const exited=new Promise(resolve=>server.once('exit',resolve));let browser; let page
 try{
  const launch=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Native UI startup timed out')),45000);const read=b=>{log+=b.toString();const m=log.match(/dsh web: (http:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}};server.stdout.on('data',read);server.stderr.on('data',read);server.once('exit',()=>{clearTimeout(timer);reject(new Error('Harness exited during startup'))})})
  if(provided) await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Provided model setup timed out')),30000)
    server.once('message',m=>{clearTimeout(timer);m.error?reject(new Error(m.error)):resolve(m)})
    server.send('configure-provided-model')
  })
  const origin=new URL(launch).origin
  assert.equal((await fetch(origin+'/fieldwork-data')).status,401)
  browser=await chromium.launch({headless:true,...process.env.FIELDWORK_BROWSER_CHANNEL?{channel:process.env.FIELDWORK_BROWSER_CHANNEL}:{}})
  page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  assert.equal((await page.request.get(launch).catch(()=>{throw new Error('Authenticated entry failed')})).status(),200)
  await page.goto(origin)
  if(!provided) await page.getByRole('button',{name:'Continue',exact:true}).click()
  let initial
  if(!provided){
    await page.getByText('Choose a connected model below; your farm conversation starts automatically.',{exact:true}).waitFor()
    initial=await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))
    assert.equal(initial.phase,'agent-setup');assert.equal(initial.started,false)
    assert.equal(await readFile(logFile,'utf8'),'')
    await mkdir(join(root,'.artifacts/builtin-preview'),{recursive:true})
    await page.screenshot({path:join(root,'.artifacts/builtin-preview/agent-setup.png')})
    await page.setViewportSize({width:390,height:844})
    await page.getByRole('dialog',{name:'Navigation',exact:true}).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog',{name:'Navigation',exact:true}).waitFor({state:'hidden'})
    const bounds=await page.getByRole('region',{name:'Farm setup',exact:true}).boundingBox()
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390,'Setup hint must fit the phone viewport')
    await page.screenshot({path:join(root,'.artifacts/builtin-preview/mobile-setup.png')})
    await page.setViewportSize({width:1440,height:1000})
    await page.getByRole('button',{name:'Select model',exact:true}).click()
    await page.getByRole('menuitemradio',{name:'Onboarding test model',exact:true}).click()
  }
  const greeting='Welcome to your corn farm workspace. This is the onboarding test model.'
  await page.getByText(greeting,{exact:true}).waitFor()
  if(provided){const intro=page.getByRole('button',{name:'Continue',exact:true});if(await intro.isVisible())await intro.click()}
  initial ??= await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))
  await page.getByRole('button',{name:'Send message',exact:true}).waitFor()
  assert.equal((await readFile(logFile,'utf8')).trim(),'greeting')
  await page.reload()
  await page.getByText(greeting,{exact:true}).waitFor()
  const tab=await page.context().newPage()
  await tab.goto(origin)
  await tab.getByText(greeting,{exact:true}).waitFor()
  await tab.close()
  assert.equal((await readFile(logFile,'utf8')).trim(),'greeting')
  assert.equal((await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))).sessionId,initial.sessionId)
  await page.getByRole('button',{name:'Farm setup options',exact:true}).click()
  await page.getByRole('button',{name:'Do this later',exact:true}).click()
  await page.getByRole('heading',{name:'My farm',exact:true}).waitFor()
  assert.equal((await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))).phase,'deferred')
  await page.reload()
  assert.equal((await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))).phase,'deferred')
  await page.getByRole('button',{name:'Farm setup',exact:true}).click()
  await page.getByRole('button',{name:'Resume farm setup',exact:true}).click()
  await page.getByText(greeting,{exact:true}).waitFor()
  await page.getByRole('button',{name:'Farm setup options',exact:true}).click()
  await page.getByRole('button',{name:'Finish setup for now',exact:true}).click()
  await page.getByRole('heading',{name:'My farm',exact:true}).waitFor()
  await page.reload()
  assert.equal((await page.evaluate(()=>fetch('/fieldwork-onboarding').then(r=>r.json()))).phase,'complete')
  assert.equal((await readFile(logFile,'utf8')).trim(),'greeting')
  assert.deepEqual(errors,[])
 }catch(error){ if(page){console.log((await page.locator('body').innerText()).slice(-10000));await page.screenshot({path:join(root,'.artifacts/native-pages/failure.png')})};throw error }finally{
  if(browser)await browser.close()
  server.kill('SIGTERM');const kill=setTimeout(()=>server.kill('SIGKILL'),5000);await exited;clearTimeout(kill);await rm(home,{recursive:true,force:true})
 }
})
