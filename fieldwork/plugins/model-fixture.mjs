/** Opt-in real subscription model test through the native Harness agent loop. */
import { createUserMessage } from '../../packages/llm/llm/src/index.ts'
export const inject = ['agents', 'agentPresets', 'loader', 'farmRecords']
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
   const before=ctx.farmRecords.snapshot()
   handle.agent.followup(createUserMessage({content:[{type:'text',text:'Read my current farm context using your tool, then compare seed quotes for 12 hectares at 1.5 bags per hectare: CAD 120 per bag versus CAD 108 per bag. Report the purchase-cost saving and its limitation. Do not save anything or mutate records.'}],source:{kind:'user'}}))
   await handle.agent.whenIdle()
   return {model:'gpt-6.1-sol',provider:'fieldwork-codex',events:handle.agent.session.snapshotEvents(),before,after:ctx.farmRecords.snapshot()}
  }finally{await handle.dispose()}
 }
}
