/** Host half of the native pages: authenticated JSON and commit notifications, never HTML. */
import type { ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '../../plugins/records.ts'
import { FarmError } from '../../plugins/records.ts'
import { z, ZodError } from 'zod'
import type {} from '../../plugins/onboarding-progress.ts'
import type {} from '../../plugins/learning.ts'
import { LearningError } from '../../plugins/learning-error.ts'
import { performLearning } from './learning-commands.ts'
import { perform } from './commands.ts'
/** Native UI transport plugin identity. */
export const name = 'fieldwork-pages'
/** Reuse the Harness transport and the same Host record owner as agent tools. */
export const inject = ['webServer', 'farmRecords', 'farmOnboarding', 'farmLearning']
/** Mount owner-only data routes; the browser pages are registered through native slots. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-onboarding', auth: 'required', async handler(req, res, peer) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json')
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    try {
      if (req.method === 'GET') { res.end(JSON.stringify(ctx.farmOnboarding.snapshot())); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return }
      let text = ''
      for await (const chunk of req) { text += chunk.toString(); if (Buffer.byteLength(text) > 2048) { res.writeHead(413).end(); return } }
      const command = z.object({ action: z.enum(['prepare', 'begin', 'defer', 'complete', 'resume']) }).parse(JSON.parse(text))
      res.end(JSON.stringify(await ctx.farmOnboarding.perform(command.action)))
    } catch (error) {
      const input = error instanceof ZodError || error instanceof SyntaxError
      if (!input) ctx.logger.warn('Could not update Fieldwork setup', error)
      res.writeHead(input ? 400 : 500).end(JSON.stringify({ error: input ? 'Check the setup action.' : 'Could not update farm setup. Your progress has been kept.' }))
    }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-original', auth: 'required', async handler(req, res, peer) {
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    try {
      const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? ''
      const bytes = await ctx.farmRecords.original(id)
      const filename = ctx.farmRecords.snapshot().sources.find(s => s.id === id)?.filename ?? 'fieldwork-original'
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="fieldwork-original"; filename*=UTF-8''${encodeURIComponent(filename)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).end(bytes)
    } catch (error) { res.writeHead(error instanceof FarmError && error.code === 'FARM_INPUT' || error instanceof LearningError && error.code === 'LEARNING_INPUT' ? 404 : 500).end() }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-image', auth: 'required', async handler(req, res, peer) {
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    try {
      const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? ''
      const source = ctx.farmRecords.snapshot().sources.find(s => s.id === id)
      if (!source?.mediaType) { res.writeHead(404).end(); return }
      const bytes = await ctx.farmRecords.original(id)
      res.writeHead(200, { 'Content-Type': source.mediaType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" }).end(bytes)
    } catch { res.writeHead(500).end() }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-learning-file', auth: 'required', async handler(req, res, peer) {
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    try {
      const id = new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? ''
      const { artifact, bytes } = await ctx.farmLearning.readArtifact(id)
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="learning-file"; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).end(bytes)
    } catch (error) { res.writeHead(error instanceof LearningError && error.code === 'LEARNING_INPUT' ? 404 : 500).end() }
  } }))
  const streams = new Map<ServerResponse, () => void>()
  ctx.effect(() => () => { for (const [response, stop] of streams) { stop(); response.end() }; streams.clear() })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-data', auth: 'required', async handler(req, res, peer) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.setHeader('X-Content-Type-Options', 'nosniff')
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    try {
      if (req.method === 'GET') { await ctx.farmLearning.refreshMethods(); res.end(JSON.stringify({ state: ctx.farmRecords.snapshot(), learning: ctx.farmLearning.snapshot() })); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return }
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of req) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > 7 * 1024 * 1024) { res.writeHead(413).end(); return }; chunks.push(buffer) }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const result = typeof input?.action === 'string' && input.action.startsWith('learning/') ? await performLearning(ctx.farmLearning, input) : await perform(ctx.farmRecords, input)
      res.end(JSON.stringify({ ...result, state: ctx.farmRecords.snapshot(), learning: ctx.farmLearning.snapshot() }))
    } catch (error) {
      const input = error instanceof ZodError || error instanceof SyntaxError || error instanceof FarmError && error.code === 'FARM_INPUT' || error instanceof LearningError && error.code === 'LEARNING_INPUT'
      if (!input) ctx.logger.warn('Fieldwork page command failed', error)
      res.writeHead(input ? 400 : 500).end(JSON.stringify({ error: error instanceof FarmError || error instanceof LearningError ? error.message : input ? 'Check the required fields and values.' : 'Could not save this change. Your records have been kept.' }))
    }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-events', auth: 'required', handler(req, res, peer) {
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write('data: ready\n\n')
    const notify = () => { res.write('data: changed\n\n') }
    const stopRecords = ctx.farmRecords.subscribe(notify), stopLearning = ctx.farmLearning.subscribe(notify)
    const stop = () => { stopRecords(); stopLearning() }
    streams.set(res, stop)
    req.once('close', () => { stop(); streams.delete(res) })
  } }))
}
