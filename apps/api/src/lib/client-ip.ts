import type { Context } from 'hono'
import ipaddr from 'ipaddr.js'

type BunServer = { requestIP(req: Request): { address: string } | null }

// The client's IP, always a valid, normalised address or "unknown". Any client can send
// X-Forwarded-For, so it is read only as far as proxies you control (`proxyHops`, from
// TRUSTED_PROXY_HOPS): each proxy appends the address it saw, so the entry `proxyHops`
// from the right was written by the outermost one. Otherwise it is the socket address.
// index.ts passes the Bun server to app.fetch, so it is c.env; tests have none.
export function clientIp(c: Context, { proxyHops }: { proxyHops: number }) {
  if (proxyHops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '').split(',')
    const ip = parseIp(chain[chain.length - proxyHops] ?? '')
    if (ip) return ip
  }
  const server = c.env as BunServer | undefined
  return parseIp(server?.requestIP?.(c.req.raw)?.address ?? '') ?? 'unknown'
}

// Strips what proxies wrap around an address (brackets, a port), then lets ipaddr.js
// validate it, unwrap IPv4-mapped IPv6 and write it in one standard form. null if not an IP.
export function parseIp(raw: string): string | null {
  let ip = raw.trim()
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip)
  if (bracketed?.[1]) ip = bracketed[1]
  else if (/^[\d.]+:\d{1,5}$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))
  // Dotted IPv4 only: ipaddr.js also accepts legacy spellings such as "1" or "0x7f.1"
  if (!ipaddr.IPv4.isValidFourPartDecimal(ip) && !ipaddr.IPv6.isValid(ip)) return null
  const addr = ipaddr.process(ip)
  if (addr instanceof ipaddr.IPv4) return addr.toString()
  addr.zoneId = undefined
  return addr.toRFC5952String()
}

// The rate-limit key for a parsed IP. An IPv6 client usually holds a whole /64, so it is
// keyed on that prefix (as Better Auth does); otherwise each new address is a new bucket.
export function rateLimitKey(ip: string) {
  if (!ipaddr.IPv6.isValid(ip)) return ip
  const prefix = ipaddr.IPv6.parse(ip).parts.slice(0, 4)
  return `${new ipaddr.IPv6([...prefix, 0, 0, 0, 0]).toRFC5952String()}/64`
}
