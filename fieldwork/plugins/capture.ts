/** Public HTTPS capture pins a public IPv4 address for each bounded request. */
import { lookup } from 'node:dns/promises'
import { BlockList } from 'node:net'
import { request } from 'node:https'
import { FarmError } from './records.ts'
function isPublic(addressToCheck: string): boolean {
  const blocked = new BlockList()
  for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix)
  return !blocked.check(addressToCheck, 'ipv4')
}
/** Validate URL syntax before DNS resolution or network access. */
export function publicCaptureUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.hostname.startsWith('[')) throw new FarmError('Capture supports public HTTPS URLs on port 443, without credentials. Upload a saved original for other sources.', 'FARM_INPUT')
  return url
}
/** Capture a bounded original; redirects retain the original HTTPS origin. */
export async function captureUrl(value: string, signal?: AbortSignal) {
  let url = publicCaptureUrl(value)
  for (let redirect = 0; redirect <= 3; redirect++) {
    signal?.throwIfAborted()
    const addresses = await lookup(url.hostname, { family: 4, all: true })
    if (!addresses.length || addresses.some(a => !isPublic(a.address))) throw new FarmError('Capture requires a publicly reachable source address.', 'FARM_INPUT')
    const pinned = addresses[0]!.address
    const result = await new Promise<{ bytes: Buffer; contentType: string; redirect?: string }>((resolve, reject) => {
      const req = request(url, { method: 'GET', agent: false, family: 4, ...(signal ? { signal } : {}), headers: { 'User-Agent': 'Fieldwork-source-capture/0.1', Accept: 'text/html,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain', 'Accept-Encoding': 'identity' }, lookup: (_host, _options, callback) => callback(null, pinned, 4) }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) { res.resume(); resolve({ bytes: Buffer.alloc(0), contentType: '', redirect: res.headers.location ?? '' }); return }
        if (res.statusCode !== 200) { res.resume(); reject(new FarmError(`Source returned HTTP ${res.statusCode}. Upload a saved original if it requires browser access.`, 'FARM_INPUT')); return }
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.resume(); reject(new FarmError('Source sent an encoded response; download and import the original instead.', 'FARM_INPUT')); return }
        const chunks: Buffer[] = []; let size = 0
        res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 5 * 1024 * 1024) req.destroy(new FarmError('Source exceeds 5 MiB.', 'FARM_INPUT')); else chunks.push(chunk) })
        res.on('error', reject)
        res.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType: res.headers['content-type'] ?? '' }))
      })
      const timer = setTimeout(() => req.destroy(new FarmError('Source capture timed out; try a saved original.', 'FARM_INPUT')), 15000)
      req.once('close', () => clearTimeout(timer)); req.on('error', reject); req.end()
    })
    if (result.redirect !== undefined) {
      const next = publicCaptureUrl(new URL(result.redirect, url).href)
      if (next.origin !== url.origin || !result.redirect) throw new FarmError('Source redirects to another origin. Review and capture the destination URL directly.', 'FARM_INPUT')
      url = next; continue
    }
    const ct = result.contentType.toLowerCase()
    const filename = ct.includes('pdf') ? 'source.pdf' : ct.includes('spreadsheetml') ? 'source.xlsx' : ct.includes('ms-excel') ? 'source.xls' : ct.includes('csv') ? 'source.csv' : ct.includes('html') ? 'source.html' : ct.includes('text/plain') ? 'source.txt' : ''
    if (!filename) throw new FarmError('Unsupported source response. Download and import the original file instead.', 'FARM_INPUT')
    return { bytes: result.bytes, filename, origin: url.href }
  }
  throw new FarmError('Source has too many redirects.', 'FARM_INPUT')
}
