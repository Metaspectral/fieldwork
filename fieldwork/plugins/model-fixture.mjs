/** Opt-in real subscription model test through the native Harness agent loop. */
import { loadCornDemo } from './corn-demo.ts'
import { createUserMessage } from '../../packages/llm/llm/src/index.ts'
export const inject = ['agents', 'agentPresets', 'loader', 'farmRecords', 'farmLearning']
export function apply(ctx) {
 const receive = message => {
  if (message !== 'test-fieldwork-model') return
  void run().then(result => process.send({result}), error => process.send({error:String(error.stack ?? error)}))
 }
 ctx.effect(() => { process.on('message',receive); return () => process.off('message',receive) })
 async function run() {
  await ctx.loader.await()
  const handle = await ctx.agents.create({sessionId:'fieldwork-subscription-check',cwd:process.cwd(),agentOptions:{provider:'fieldwork-codex',model:'gpt-6.1-sol'},setup:scope=>ctx.agentPresets.mount(scope,'fieldwork').then(()=>undefined)})
  try {
   if (process.env.FIELDWORK_RESEARCH_MODEL_TEST === '1') await loadCornDemo(ctx.farmRecords)
   if (process.env.FIELDWORK_LEARNING_MODEL_TEST === '1') { const id = await ctx.farmLearning.createDemo(); await ctx.farmLearning.checkNow(id); await ctx.farmLearning.setMonitorActive(id, false) }
   if (process.env.FIELDWORK_INVESTIGATION_MODEL_TEST === '1') {
    await ctx.farmRecords.change(s => { s.fields.push({ id: 'historical-corn-field', name: 'Historical corn field · synthetic test', areaHa: 4, evidence: 'demo', years: {}, notes: ['Current crop unknown.'] }) })
    const source = await ctx.farmRecords.importSource(Buffer.from('X,Y,Yield\n1,1,0\n2,2,20\n3,3,10\n'), { title: 'Synthetic historical yield points', filename: 'points.csv', evidence: 'demo', scope: '2014 synthetic corn points; current management unknown', origin: 'Test fixture', season: 2014 })
    const id = await ctx.farmLearning.saveInvestigation({ fieldId: 'historical-corn-field', season: 2014, question: 'Do low-yield bands recur in matched corn seasons?', notes: 'No treatment, quote, current crop, or diagnosis is known.', evidence: [{ sourceId: source.id, season: 2014, crop: 'corn', role: 'yield' }], tasks: [] })
    await ctx.farmLearning.analyzeYield({ investigationId: id, sourceId: source.id, sheet: 'Sheet1', xColumn: 'X', yColumn: 'Y', valueColumn: 'Yield', unit: 'unknown', coordinateSystem: 'unknown' })
   }
   const learningBefore=ctx.farmLearning.snapshot()
   const before=ctx.farmRecords.snapshot()
   handle.agent.followup(createUserMessage({content:[{type:'text',text: process.env.FIELDWORK_INVESTIGATION_MODEL_TEST === '1' ? 'Read my farm and discover the existing investigation using your tools. Read historical-yield with read_farm_method. Explain what its saved point analysis does and does not establish, why the current baseline and units can stay unknown, and two practical next evidence checks. Do not invent a target, seed quote, treatment, diagnosis or current crop. Do not save or change anything.' : process.env.FIELDWORK_LEARNING_MODEL_TEST === '1' ? 'Read my farm and discover the available methods for investigating uneven corn growth. Read the watch-field and scout-pattern method instructions using tools. Inspect the existing monitor history. Explain what the simulated observation can tell us, why a weekly availability check might find no new usable image, and a sensible next scouting step. Do not change, enable, or save anything.' : process.env.FIELDWORK_RESEARCH_MODEL_TEST === '1' ? 'Read my farm and farm research using your tools, then inspect the saved source for the fictional corn proposal. Explain the current baseline, trial seeding rate, whole bag budgets, and difference in CAD. Cite the source ID and exact locator. Explain why no yield or profit improvement can be claimed. Do not save anything or mutate records.' : 'Read my current farm context using your tool, then compare seed quotes for 12 hectares at 1.5 bags per hectare: CAD 120 per bag versus CAD 108 per bag. Report the purchase-cost saving and its limitation. Do not save anything or mutate records.'}],source:{kind:'user'}}))
   await handle.agent.whenIdle()
   return {model:'gpt-6.1-sol',provider:'fieldwork-codex',events:handle.agent.session.snapshotEvents(),before,after:ctx.farmRecords.snapshot(),learningBefore,learningAfter:ctx.farmLearning.snapshot()}
  }finally{await handle.dispose()}
 }
}
