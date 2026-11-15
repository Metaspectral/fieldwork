/** Source-loaded Fieldwork Host plugin over the authenticated Harness web server. */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readFile } from 'node:fs/promises'
import { FarmStore, InputError, catalog } from './domain.ts'
import { ZodError } from 'zod'

declare module '@deepseek-ai/cordis' {
  interface Context { fieldwork: FarmStore }
}
/** Source-plugin identity. */
export const name = 'fieldwork-poc'
/** Authenticated HTTP transport provided by the web profile. */
export const inject = ['webServer']
/** Local record destination, supplied by the composition. */
export interface Config { file: string }
/** Validate the record destination before loading. */
export const Config: schema<Config> = schema.object({ file: schema.string().required() })
/** Mount private farm records and the POC interface; disposal removes every route. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = await FarmStore.open(config.file)
  ctx.provide('fieldwork', store)
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/fieldwork', auth: 'required', async handler(req, res, peer) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (peer?.principal.kind !== 'owner') { res.writeHead(403).end(); return }
    const path = new URL(req.url ?? '/', 'http://fieldwork.invalid').pathname
    if (path === '/fieldwork/api') {
      res.setHeader('Content-Type', 'application/json')
      try {
        if (req.method === 'GET') { res.end(JSON.stringify({ state: store.snapshot(), catalog })); return }
        if (req.method !== 'POST') { res.writeHead(405).end(); return }
        if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host || !req.headers['content-type']?.startsWith('application/json')) {
          res.writeHead(403).end(JSON.stringify({ error: 'Use this workspace to submit changes.' })); return
        }
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk)
          bytes += buffer.length
          if (bytes > 32768) { res.writeHead(413).end(JSON.stringify({ error: 'Keep the request below 32 KB.' })); return }
          chunks.push(buffer)
        }
        const result = await store.execute(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        res.end(JSON.stringify(result))
      } catch (error) {
        const input = error instanceof ZodError || error instanceof SyntaxError || error instanceof InputError
        if (!input) ctx.logger.warn('Fieldwork could not save the operation', error)
        res.writeHead(input ? 400 : 500).end(JSON.stringify({ error: error instanceof InputError ? error.message : input ? 'Check the required fields and numeric values.' : 'Could not save your change. Your accepted records have not changed.' }))
      }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
    const assets: Record<string, [string, string]> = {
      '/fieldwork': ['index.html', 'text/html'], '/fieldwork/': ['index.html', 'text/html'],
      '/fieldwork/app.js': ['app.js', 'text/javascript'], '/fieldwork/style.css': ['style.css', 'text/css'],
    }
    const asset = assets[path]
    if (!asset) { res.writeHead(404).end(); return }
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    res.setHeader('Content-Type', `${asset[1]}; charset=utf-8`)
    const body = await readFile(new URL(asset[0], import.meta.url))
    res.end(req.method === 'HEAD' ? undefined : body)
  } }))
}
