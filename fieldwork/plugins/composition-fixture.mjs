/** Test-only IPC driver over real Loader-mounted plugins and the native tool executor. */
import { executeModelToolFixture } from '../../packages/test-support/tool-testkit/src/index.ts'
export const inject = ['agents', 'agentPresets', 'tools', 'farmRecords', 'loader']
export function apply(ctx) {
  const receive = message => {
    if (message !== 'exercise-fieldwork') return
    void run().then(result => process.send({ result }), error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => { process.on('message', receive); return () => process.off('message', receive) })
  async function run() {
    await ctx.loader.await()
    const handle = await ctx.agents.create({ sessionId: 'fieldwork-native-test', cwd: process.cwd(), setup: scope => ctx.agentPresets.mount(scope, 'fieldwork').then(() => undefined) })
    let allow = false
    const approvalDetails = []
    const release = ctx.on('approval/request', (request, next) => {
      if (!['update_my_farm', 'plan_crop_trial', 'adapt_community_method', 'start_crop_tracking', 'record_crop_observation', 'publish_farm_summary', 'withdraw_farm_summary'].includes(request.toolName)) return next()
      approvalDetails.push(request)
      return Promise.resolve(allow ? 'allowed-once' : 'rejected')
    }, { prepend: true })
    const call = (name, args = {}) => executeModelToolFixture(ctx, { name, arguments: args, agent: handle.agent, callId: `native-${crypto.randomUUID()}`, signal: new AbortController().signal })
    const value = result => { if (result.isError) throw new Error(JSON.stringify(result.error)); return JSON.parse(result.value) }
    handle.agent.session.append('turn/start', { turn: 1 })
    try {
      const names = ctx.tools.schemas(handle.agent).map(t => t.name)
      const before = ctx.farmRecords.snapshot()
      const denied = await call('plan_crop_trial', { title: 'Small trial', change: 'Try peas on one strip', trialAreaHa: .5 })
      const afterDenied = ctx.farmRecords.snapshot()
      allow = true
      const comparison = value(await call('compare_seed_quotes', { areaHa: 12, bagsPerHa: 1.5, currentCadPerBag: 120, alternativeCadPerBag: 108 }))
      const trial = value(await call('adapt_community_method', { postId: 'sample-cover-crop' }))
      value(await call('start_crop_tracking', { id: trial.id }))
      value(await call('record_crop_observation', { id: trial.id, observation: 'Private exact location and CAD 500 cost; wet soil.' }))
      const preview = value(await call('preview_farm_summary', { id: trial.id, title: 'A small field trial', takeaway: 'Inconclusive; record soil conditions next season.' }))
      const published = value(await call('publish_farm_summary', { previewId: preview.previewId }))
      value(await call('withdraw_farm_summary', { id: published.id }))
      const planned = value(await call('plan_crop_trial', { title: 'Try a little', change: 'Locally reviewed alternative', trialAreaHa: .5 }))
      const invalid = await call('plan_crop_trial', { title: 'Too much', change: 'Alternative', trialAreaHa: 20 })
      return { names, before, denied, afterDenied, comparison, preview, published, planned, invalid, final: ctx.farmRecords.snapshot(), approvalCount: approvalDetails.length }
    } finally {
      release()
      handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await handle.dispose()
    }
  }
}
