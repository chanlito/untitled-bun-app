import type { Context } from 'hono'
import { isIP } from 'node:net'

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

// Strips what proxies wrap around an address (brackets, an IPv4 port, an IPv6 zone),
// writes IPv6 in its one standard form and unwraps IPv4-mapped IPv6, so one client is
// always one string. null when it isn't an IP.
export function parseIp(raw: string): string | null {
  let ip = raw.trim()
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip)
  if (bracketed?.[1]) ip = bracketed[1]
  else if (/^[\d.]+:\d{1,5}$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))
  if (isIP(ip) === 4) return ip
  ip = ip.split('%')[0] ?? ''
  if (isIP(ip) !== 6) return null
  // The URL parser writes IPv6 the standard way: lowercase, zeros compressed
  const standard = new URL(`http://[${ip}]`).hostname.slice(1, -1)
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(standard)
  if (mapped?.[1] && mapped[2]) {
    const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)]
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
  }
  return standard
}

// The rate-limit key for a parsed IP. An IPv6 client usually holds a whole /64, so it is
// keyed on that prefix (as Better Auth does); otherwise each new address is a new bucket.
export function rateLimitKey(ip: string) {
  if (isIP(ip) !== 6) return ip
  const [head = '', tail] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const zeros = Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0')
  const groups = tail === undefined ? left : [...left, ...zeros, ...right]
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}
