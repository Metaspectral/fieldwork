/** Keyless test-only provider, loaded exclusively by the browser test overlay. */
import { LlmAdapter } from '../../packages/llm/llm/src/index.ts'
import { appendFile } from 'node:fs/promises'
export const inject = ['llm', 'farmOnboarding', 'sessionController', 'loader']
export function apply(ctx, config) {
  class TestModel extends LlmAdapter {
    async listModels(provider) { return [{ provider, id: 'onboarding-test', name: 'Onboarding test model', inputModalities: ['text'] }] }
    async resolveModel(provider, model) { return { provider, id: model, name: 'Onboarding test model', inputModalities: ['text'], context: { contextWindow: 500000 } } }
    async *stream(options) {
      const conversation = options.tools?.some(t => t.name === 'ask_user_question')
      if (conversation) await appendFile(config.log, 'greeting\n')
      const text = conversation ? 'Welcome to your corn farm workspace. This is the onboarding test model.' : 'Farm setup'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['fieldwork-test'], new TestModel())
  const configure = message => {
    if (message !== 'configure-provided-model') return
    void (async () => {
      await ctx.loader.await()
      const state = await ctx.farmOnboarding.perform('prepare')
      await ctx.sessionController.selectModel({ sessionId: state.sessionId, provider: 'fieldwork-test', model: 'onboarding-test' })
      process.send({ configured: true })
    })().catch(error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => { process.on('message', configure); return () => process.off('message', configure) })
}
