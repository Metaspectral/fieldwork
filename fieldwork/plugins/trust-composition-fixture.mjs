/** Test-only IPC driver for the trust guideline over real Loader-mounted plugins and the native tool executor. */
import { readFile } from 'node:fs/promises'
import { executeModelToolFixture } from '../../packages/test-support/tool-testkit/src/index.ts'
export const inject = ['agents', 'agentPresets', 'tools', 'farmRecords', 'trustRecords', 'loader']
export function apply(ctx) {
  const receive = message => {
    if (message !== 'exercise-trust') return
    void run().then(result => process.send({ result }), error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => { process.on('message', receive); return () => process.off('message', receive) })
  async function run() {
    await ctx.loader.await()
    const handle = await ctx.agents.create({ sessionId: 'fieldwork-trust-test', cwd: process.cwd(), setup: scope => ctx.agentPresets.mount(scope, 'fieldwork').then(() => undefined) })
    let allow = true
    const asked = []
    const release = ctx.on('approval/request', (request, next) => {
      if (!['plan_crop_trial', 'trust_set_pace', 'trust_forget', 'agronomist_packet', 'check_estimate'].includes(request.toolName)) return next()
      asked.push(request.toolName)
      return Promise.resolve(allow ? 'allowed-once' : 'rejected')
    }, { prepend: true })
    const call = (name, args = {}) => executeModelToolFixture(ctx, { name, arguments: args, agent: handle.agent, callId: `trust-${crypto.randomUUID()}`, signal: new AbortController().signal })
    const value = result => { if (result.isError) throw new Error(JSON.stringify(result.error)); return typeof result.value === 'string' ? JSON.parse(result.value) : result.value }
    const text = result => result.content.map(c => c.text ?? '').join('\n')
    const stage = async () => value(await call('trust_status')).stage
    handle.agent.session.append('turn/start', { turn: 1 })
    try {
      const names = ctx.tools.schemas(handle.agent).map(t => t.name)
      const stages = { start: await stage() }
      // Nothing is locked: a trial the farmer asks for goes straight to its normal approval at stage 1.
      const trial = await call('plan_crop_trial', { title: 'Sorghum on the north pivot strip', change: 'Grain sorghum on one strip', trialAreaHa: 0.5 })
      const field = value(await call('find_field', { latitude: 37.9842, longitude: -100.8653 }))
      value(await call('field_history', { fieldId: field.fieldId, part: 'all' }))
      value(await call('field_risks', { fieldId: field.fieldId }))
      // No wait: auto signals are committed before the tool result returns.
      stages.afterHistory = await stage()
      value(await call('trust_note', { kind: 'question_asked', detail: 'how do you know 2022 was dry?' }))
      value(await call('show_source', { id: 'bowles2020' }))
      const risk = await call('risk_check', { field: 'North pivot', acres: 126, current: ['corn', 'corn', 'soybean'], proposed: ['corn', 'sorghum', 'soybean'], dryYears: 3, ofYears: 5 })
      stages.afterRisk = await stage()
      value(await call('trust_note', { kind: 'suggestion_declined', detail: 'not this year' }))
      stages.afterDecline = await stage()
      const estimateId = value(risk).estimateId
      const checkedEstimate = value(await call('check_estimate', { id: estimateId, yearWas: 'dry', actual: 40, detail: 'Strip beat the corn in a dry August' }))
      const packet = value(await call('agronomist_packet', { fields: ['north pivot'] }))
      const packetText = await readFile(packet.path, 'utf8')
      value(await call('trust_set_pace', { pace: 'quiet' }))
      stages.quiet = await stage()
      allow = false
      const refusedAuto = await call('trust_set_pace', { pace: 'auto' })
      allow = true
      const forgotten = value(await call('trust_forget', { what: 'signals' }))
      return { names, stages, trial, riskText: text(risk), checkedEstimate, packetText, refusedAuto, forgotten, final: ctx.trustRecords.snapshot(), asked }
    } finally {
      release()
      handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await handle.dispose()
    }
  }
}
