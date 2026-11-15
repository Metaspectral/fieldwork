/** Host half of the native pages: authenticated JSON and commit notifications, never HTML. */
import type { ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '../../plugins/records.ts'
import { FarmError } from '../../plugins/records.ts'
import { ZodError } from 'zod'
import { perform } from './commands.ts'
/** Native UI transport plugin identity. */
export const name = 'fieldwork-pages'
/** Reuse the Harness transport and the same Host record owner as agent tools. */
export const inject = ['webServer', 'farmRecords']
/** Mount owner-only data routes; the browser pages are registered through native slots. */
export function apply(ctx: Context): void {
  const streams = new Map<ServerResponse, () => void>()
  ctx.effect(() => () => { for (const [response, stop] of streams) { stop(); response.end() }; streams.clear() })
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-data', auth: 'required', async handler(req, res, peer) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.setHeader('X-Content-Type-Options', 'nosniff')
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    try {
      if (req.method === 'GET') { res.end(JSON.stringify({ state: ctx.farmRecords.snapshot() })); return }
      if (req.method !== 'POST') { res.writeHead(405).end(); return }
      if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return }
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of req) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > 32768) { res.writeHead(413).end(); return }; chunks.push(buffer) }
      res.end(JSON.stringify(await perform(ctx.farmRecords, JSON.parse(Buffer.concat(chunks).toString('utf8')))))
    } catch (error) {
      const input = error instanceof ZodError || error instanceof SyntaxError || error instanceof FarmError && error.code === 'FARM_INPUT'
      if (!input) ctx.logger.warn('Fieldwork page command failed', error)
      res.writeHead(input ? 400 : 500).end(JSON.stringify({ error: error instanceof FarmError ? error.message : input ? 'Check the required fields and values.' : 'Could not save this change. Your records have been kept.' }))
    }
  } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/fieldwork-events', auth: 'required', handler(req, res, peer) {
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write('data: ready\n\n')
    const stop = ctx.farmRecords.subscribe(() => { res.write('data: changed\n\n') })
    streams.set(res, stop)
    req.once('close', () => { stop(); streams.delete(res) })
  } }))
}
