/** Explicitly opt-in subscription test; ordinary tests never spend model usage. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
test('gpt-6.1-sol uses the Codex subscription through the actual Harness loop', { skip: process.env.FIELDWORK_SUBSCRIPTION_TEST !== '1', timeout: 300000 }, async () => {
 const home=await mkdtemp(join(tmpdir(),'fieldwork-model-'))
 const overlay=join(home,'fixture.yml')
 await writeFile(overlay,`- insert:\n    - id: fieldwork-model-test\n      name: ${JSON.stringify(join(root,'fieldwork/plugins/model-fixture.mjs'))}\n`)
 const server=fork(join(root,'apps/cli/src/bin.ts'),['--profile','web','--patch','fieldwork/plugins/cordis.source.patch.yml','--patch',overlay,'--no-open','--port','0'],{cwd:root,execArgv:['--import','tsx/esm'],env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'},silent:true})
 const exited=new Promise(resolve=>server.once('exit',resolve))
 let output=''
 try {
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('Subscription model test timed out')),280000)
   let sent=false
   const ready=chunk=>{output+=chunk.toString();if(!sent&&output.includes('dsh web: ')){sent=true;server.send('test-fieldwork-model')}}
   server.stdout.on('data',ready);server.stderr.on('data',ready)
   server.on('message',m=>{clearTimeout(timeout);m.error?reject(new Error(m.error)):resolve(m.result)})
   server.once('exit',()=>{clearTimeout(timeout);reject(new Error('Harness exited before model test finished'))})
  })
  await mkdir(join(root,'.artifacts/model-test'),{recursive:true})
  await writeFile(join(root,'.artifacts/model-test/result.json'),JSON.stringify(result,null,2),{mode:0o600})
  assert.equal(result.model,'gpt-6.1-sol')
  assert.deepEqual(result.after,result.before)
  const calls=result.events.filter(e=>e.type==='tool/call').map(e=>e.data.name)
  assert.ok(calls.includes('read_my_farm'),'Model must actually read farm context')
  if (process.env.FIELDWORK_RESEARCH_MODEL_TEST === '1') { assert.ok(calls.includes('read_farm_research')); assert.ok(calls.includes('read_farm_source')) }
  else assert.ok(calls.includes('compare_seed_quotes'),'Model must actually call the deterministic calculator')
  const answers=result.events.filter(e=>e.type==='assistant/message').flatMap(e=>e.data.message.content).filter(b=>b.type==='text').map(b=>b.text)
  if (process.env.FIELDWORK_RESEARCH_MODEL_TEST === '1') { assert.match(answers.at(-1), /38,?889/); assert.match(answers.at(-1), /300/); assert.match(answers.at(-1), /block 1/); assert.ok(answers.at(-1).includes(result.before.sources[0].id)) }
  else assert.ok(answers.at(-1).includes('216'),'Final response must report the verified saving')
  assert.equal(result.events.filter(e=>e.type==='turn/end').at(-1).data.reason.kind,'completed')

 } finally {
  server.kill('SIGTERM');const kill=setTimeout(()=>server.kill('SIGKILL'),5000);await exited;clearTimeout(kill);await rm(home,{recursive:true,force:true})
 }
})
