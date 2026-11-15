/** Test-only IPC driver over real Loader-mounted plugins and the native tool executor. */
import { executeModelToolFixture } from '../../packages/test-support/tool-testkit/src/index.ts'
export const inject = ['agents', 'agentPresets', 'tools', 'farmRecords', 'farmLearning', 'loader']
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
      if (!['update_my_farm', 'plan_crop_trial', 'adapt_community_method', 'start_crop_tracking', 'record_crop_observation', 'publish_farm_summary', 'withdraw_farm_summary', 'correct_year', 'save_field_note', 'save_farm_field', 'catalog_farmer_knowledge', 'capture_farm_source', 'propose_corn_plan', 'accept_corn_plan', 'observe_corn_plan', 'enable_field_monitor', 'set_field_monitor_active', 'save_field_scouting', 'draft_field_comparison', 'start_field_comparison', 'review_field_comparison'].includes(request.toolName)) return next()
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
      const deniedCorrection = await call('correct_year', { fieldId: 'finney-ks-126', year: 2022, crop: 'corn', whatWasWrong: 'Farmer confirms corn.' })
      const deniedSource = await call('catalog_farmer_knowledge', { title: 'Private note', origin: 'Farmer', content: 'Current seeding rate 32000 seeds/acre.', evidence: 'farmer-reported', scope: 'Own field only' })
      allow = true
      const correction = await call('correct_year', { fieldId: 'finney-ks-126', year: 2022, crop: 'corn', whatWasWrong: 'Farmer confirms corn.' })
      const methods = value(await call('discover_farm_methods', { question: 'Investigate an uneven corn field pattern' }))
      const method = value(await call('read_farm_method', { id: 'watch-field' }))
      const monitorArgs = { monitor: { fieldId: 'finney-ks-126', mode: 'demo', question: 'Fictional corn pattern', boundary: { type: 'Polygon', coordinates: [[[-100.87, 37.98], [-100.867, 37.98], [-100.867, 37.982], [-100.87, 37.982], [-100.87, 37.98]]] }, minUsableFraction: .6, minValidPixels: 16, lookbackDays: 30 } }
      allow = false
      const deniedMonitor = await call('enable_field_monitor', monitorArgs)
      allow = true
      const monitor = value(await call('enable_field_monitor', monitorArgs))
      const monitorCheck = value(await call('check_field_monitor', { id: monitor.id }))
      value(await call('set_field_monitor_active', { id: monitor.id, active: false }))
      const sharedResearch = value(await call('read_farm_research'))
      const catalog = value(await call('catalog_farmer_knowledge', { title: 'Private farmer baseline', origin: 'Farmer', content: 'Current seeding rate 32000 seeds/acre.', evidence: 'farmer-reported', scope: 'Own field only; no yield validation' }))
      const evidence = value(await call('read_farm_source', { id: catalog.id, query: '32000' }))
      const fieldId = value(await call('save_farm_field', { name: 'Own corn field', areaHa: 4, evidence: 'farmer-reported', reason: 'Preserve baseline and avoid the wet corner.' }))
      const inputs = { areaHa: 4, trialAreaHa: 1, baselineSeedsPerAcre: 32000, targetPlantsPerAcre: 35000, establishmentFraction: .9, seedsPerBag: 80000, pricePerBag: 300, currency: 'CAD' }
      const corn = value(await call('propose_corn_plan', { proposal: { fieldId, season: 2027, baselineReason: 'Preserve baseline outside the small trial.', constraints: ['Avoid the wet corner.'], inputs, assumptions: Object.keys(inputs).map(label => ({ label, evidence: 'farmer-reported' })), citations: [{ sourceId: catalog.id, locator: 'block 1' }] } }))
      allow = false
      const deniedCorn = await call('accept_corn_plan', { id: corn.id })
      allow = true
      const acceptedCorn = value(await call('accept_corn_plan', { id: corn.id }))
      value(await call('observe_corn_plan', { id: corn.id, date: '2026-11-14', text: 'Stand not measured yet; soil condition recorded.', evidence: 'farmer-reported' }))
      const comparison = value(await call('compare_seed_quotes', { areaHa: 12, bagsPerHa: 1.5, currentCadPerBag: 120, alternativeCadPerBag: 108 }))
      const trial = value(await call('adapt_community_method', { postId: 'sample-cover-crop' }))
      value(await call('start_crop_tracking', { id: trial.id }))
      value(await call('record_crop_observation', { id: trial.id, observation: 'Private exact location and CAD 500 cost; wet soil.' }))
      const preview = value(await call('preview_farm_summary', { id: trial.id, title: 'A small field trial', takeaway: 'Inconclusive; record soil conditions next season.' }))
      const published = value(await call('publish_farm_summary', { previewId: preview.previewId }))
      value(await call('withdraw_farm_summary', { id: published.id }))
      const planned = value(await call('plan_crop_trial', { title: 'Try a little', change: 'Locally reviewed alternative', trialAreaHa: .5 }))
      const invalid = await call('plan_crop_trial', { title: 'Too much', change: 'Alternative', trialAreaHa: 20 })
      return { methods, method, deniedMonitor, monitorCheck, corn, deniedCorn, acceptedCorn, sharedResearch, deniedSource, evidence, names, before, denied, deniedCorrection, correction, afterDenied, comparison, preview, published, planned, invalid, final: ctx.farmRecords.snapshot(), approvalCount: approvalDetails.length }
    } finally {
      release()
      handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await handle.dispose()
    }
  }
}
