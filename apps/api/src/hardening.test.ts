import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { MAX_BODY_BYTES } from './app'
import { clientIp, parseIp, rateLimitKey } from './lib/client-ip'
import { createTestApp, type TestApp } from './test/app'

let t: TestApp
beforeAll(async () => (t = await createTestApp()))
afterAll(() => t.close())

describe('request ids and logs', () => {
  test('every response carries an X-Request-Id, and its request is logged with it', async () => {
    const res = await t.app.request('/health?token=secret')
    const id = res.headers.get('x-request-id')
    expect(id).toBeTruthy()
    const line = t.logger.lines.find((l) => l.requestId === id)
    expect(line).toMatchObject({ level: 'info', msg: 'request', method: 'GET', status: 200 })
    // The path only: query strings can carry tokens
    expect(line?.path).toBe('/health')
  })

  test('an incoming X-Request-Id from a proxy is kept', async () => {
    const res = await t.app.request('/health', { headers: { 'x-request-id': 'from-proxy-1' } })
    expect(res.headers.get('x-request-id')).toBe('from-proxy-1')
  })
})

describe('security headers', () => {
  test('responses carry the hardening headers', async () => {
    const res = await t.app.request('/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })
})

describe('body limit', () => {
  test(`a body over ${MAX_BODY_BYTES} bytes gets 413 before any handler`, async () => {
    const res = await t.app.request('/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(MAX_BODY_BYTES) }),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ message: 'Request body too large' })
  })
})

describe('unhandled errors', () => {
  test('return a bare 500 and log the error with the request id', async () => {
    const own = await createTestApp()
    own.app.get('/boom', () => {
      throw new Error('kaboom')
    })
    const res = await own.app.request('/boom')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ message: 'Internal server error' })
    const line = own.logger.lines.find((l) => l.msg === 'unhandled error')
    expect(line?.requestId).toBe(res.headers.get('x-request-id'))
    expect((line?.err as Error).message).toBe('kaboom')
    await own.close()
  })
})

describe('rate limit', () => {
  test('API routes get 429 with Retry-After past the limit; /health and /api/auth are exempt', async () => {
    const limited = await createTestApp({ rateLimitPerMinute: 2 })
    const doc = () => limited.app.request('/doc')
    expect((await doc()).status).toBe(200)
    const second = await doc()
    expect(second.headers.get('ratelimit-remaining')).toBe('0')
    const third = await doc()
    expect(third.status).toBe(429)
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await third.json()).toEqual({ message: 'Too many requests' })

    for (let i = 0; i < 3; i++) {
      expect((await limited.app.request('/health')).status).toBe(200)
      expect((await limited.app.request('/api/auth/ok')).status).toBe(200)
    }
    await limited.close()
  })
})

describe('client ip', () => {
  const app = (proxyHops: number) => new Hono().get('/', (c) => c.text(clientIp(c, { proxyHops })))
  const xff = { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }

  test('X-Forwarded-For is ignored without trusted proxies', async () => {
    expect(await (await app(0).request('/', { headers: xff })).text()).toBe('unknown')
  })

  test('with one trusted proxy, the entry it appended wins over what the client sent', async () => {
    expect(await (await app(1).request('/', { headers: xff })).text()).toBe('203.0.113.7')
  })

  test('an entry that is not an IP falls back to the socket address', async () => {
    const headers = { 'x-forwarded-for': '1:2:3:4:5:6:7:8::9' }
    expect(await (await app(1).request('/', { headers })).text()).toBe('unknown')
  })

  test('with two, the entry the outer proxy appended', async () => {
    expect(await (await app(2).request('/', { headers: xff })).text()).toBe('6.6.6.6')
  })
})

describe('parseIp', () => {
  test.each([
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['203.0.113.7:51234', '203.0.113.7'],
    ['[2001:db8::1]:443', '2001:db8::1'],
    ['2001:DB8::1%eth0', '2001:db8::1'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::1', '::1'],
  ])('%p is %p', (raw, ip) => expect(parseIp(raw)).toBe(ip))

  test.each(['', 'unknown', '1:2:3:4:5:6:7:8::9', '1::2::3', '999.1.1.1'])(
    '%p is not an IP',
    (raw) => expect(parseIp(raw)).toBeNull(),
  )
})

describe('rate limit key', () => {
  test('IPv4 is used as is', () => expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7'))
  test('anything else unparsed is used as is', () =>
    expect(rateLimitKey('unknown')).toBe('unknown'))

  test('IPv6 addresses in one /64 share a key', () => {
    expect(rateLimitKey('2001:db8:0:1::aaaa')).toBe('2001:db8:0:1::/64')
    expect(rateLimitKey('2001:DB8:0000:0001:ffff:1:2:3')).toBe('2001:db8:0:1::/64')
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64')
  })
})

describe('on a real server', () => {
  // bodyLimit swaps in a copied request for bodies without Content-Length, and Bun can't
  // tell the socket address of a copy: the IP has to be resolved before it runs
  test('a chunked body still has the socket address as its client IP', async () => {
    const own = await createTestApp()
    own.app.post('/ip', async (c) => {
      await c.req.text()
      return c.text(c.var.clientIp)
    })
    const server = Bun.serve({ port: 0, fetch: (req, s) => own.app.fetch(req, s) })
    try {
      const body = new ReadableStream({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode('hi'))
          ctl.close()
        },
      })
      const res = await fetch(new URL('/ip', server.url), {
        method: 'POST',
        body,
        duplex: 'half',
      } as RequestInit)
      expect(await res.text()).toBe('127.0.0.1')
    } finally {
      await server.stop(true)
      await own.close()
    }
  })
})
