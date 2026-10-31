import type { Context } from 'hono'

type BunServer = { requestIP(req: Request): { address: string } | null }

// The client's IP. Any client can send X-Forwarded-For, so it is read only as far as
// proxies you control (`proxyHops`, from TRUSTED_PROXY_HOPS): each proxy appends the
// address it saw, so the entry `proxyHops` from the right was written by the outermost
// one. With no proxies it is the socket address. index.ts passes the Bun server to
// app.fetch, so it is c.env; tests have no server and get "unknown".
export function clientIp(c: Context, { proxyHops }: { proxyHops: number }) {
  if (proxyHops > 0) {
    const chain = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean)
    const ip = chain[chain.length - proxyHops]
    if (ip) return ip
  }
  const server = c.env as BunServer | undefined
  return server?.requestIP?.(c.req.raw)?.address ?? 'unknown'
}

// The rate-limit key for an IP. An IPv6 client usually holds a whole /64, so it is keyed
// on that prefix (as Better Auth does); otherwise each new address would be a new bucket.
export function rateLimitKey(ip: string) {
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.toLowerCase().split('%')[0]!.split('::')
  const left = head ? head.split(':') : []
  const right = ip.includes('::') && tail ? tail.split(':') : []
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left
  return (
    groups
      .slice(0, 4)
      .map((g) => g.replace(/^0+(?=.)/, ''))
      .join(':') + '::/64'
  )
}
