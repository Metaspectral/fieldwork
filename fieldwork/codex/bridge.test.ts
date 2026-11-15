/** CLI boundary tests are keyless; subscription testing is a separate explicit command. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodexSubscriptionAdapter } from './index.ts'

test('the requested model cannot fall back to another model', async () => {
  const adapter = new CodexSubscriptionAdapter({ binary: 'codex', timeoutMs: 1000 })
  await assert.rejects(adapter.resolveModel('fieldwork-codex', 'another-model'), /only the requested/)
})
test('CLI responses become native tool calls; unknown tools fail before visible output', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-boundary-'))
  try {
    const binary = join(directory, 'fake-codex')
    const write = async (tool: string) => {
      const answer = JSON.stringify({ text: 'Reading context.', calls: [{ name: tool, arguments: '{}' }] })
      const event = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: answer } })
      await writeFile(binary, `#!/bin/sh\nif [ "$1" = login ]; then echo 'Logged in using ChatGPT'; exit 0; fi\ncat >/dev/null\nprintf '%s\\n' '${event}'\n`, { mode: 0o700 })
    }
    await write('read_my_farm')
    const adapter = new CodexSubscriptionAdapter({ binary, timeoutMs: 1000 })
    const options = { provider: 'fieldwork-codex', model: 'gpt-6.1-sol', messages: [], tools: [{ name: 'read_my_farm', description: 'Read farm context.', parameters: { type: 'object', properties: {} } }] }
    const chunks = []
    for await (const chunk of adapter.stream(options)) chunks.push(chunk)
    assert.ok(chunks.some(c => c.type === 'tool-call-delta' && c.name === 'read_my_farm'))
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })
    await write('unregistered_tool')
    const partial = []
    await assert.rejects(async () => { for await (const chunk of adapter.stream(options)) partial.push(chunk) }, /outside the Fieldwork catalog/)
    assert.equal(partial.length, 0)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
