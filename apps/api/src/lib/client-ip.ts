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
