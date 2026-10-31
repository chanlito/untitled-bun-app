import { afterEach, describe, expect, test } from 'bun:test'

import { createShutdown } from './graceful-shutdown'
import { createMemoryLogger } from './logger'

let server: Bun.Server<undefined> | undefined
afterEach(() => server?.stop(true))

// A server whose one route takes `ms` to answer, as a slow request in flight
function slowServer(ms: number) {
  server = Bun.serve({
    port: 0,
    fetch: async () => {
      await Bun.sleep(ms)
      return new Response('finished')
    },
  })
  return server
}

describe('graceful shutdown', () => {
  test('lets a request in flight finish, refuses new ones, then closes', async () => {
    const server = slowServer(300)
    const controller = new AbortController()
    const closed: string[] = []
    const shutdown = createShutdown({
      server,
      controller,
      logger: createMemoryLogger(),
      graceMs: 5_000,
      close: () => Promise.resolve(void closed.push('db')),
    })

    const inFlight = fetch(server.url).then((res) => res.text())
    await Bun.sleep(50)
    const done = shutdown('SIGTERM')

    expect(controller.signal.aborted).toBe(true)
    expect(await fetch(server.url).catch((err: { code: string }) => err.code)).toBe('ECONNREFUSED')
    expect(closed).toEqual([])
    expect(await inFlight).toBe('finished')
    await done
    expect(closed).toEqual(['db'])
  })

  test('cuts requests still running after the grace period', async () => {
    const server = slowServer(10_000)
    const logger = createMemoryLogger()
    const shutdown = createShutdown({
      server,
      controller: new AbortController(),
      logger,
      graceMs: 100,
    })

    const inFlight = fetch(server.url).then(
      () => 'answered',
      () => 'cut',
    )
    await Bun.sleep(50)
    const start = performance.now()
    await shutdown('SIGTERM')

    expect(performance.now() - start).toBeLessThan(2_000)
    expect(await inFlight).toBe('cut')
    expect(logger.lines.map((l) => l.msg)).toContain(
      'requests still running after the grace period; closing them',
    )
  })

  test('a second signal joins the shutdown already running', async () => {
    const server = slowServer(0)
    let closes = 0
    const shutdown = createShutdown({
      server,
      controller: new AbortController(),
      logger: createMemoryLogger(),
      graceMs: 1_000,
      close: () => Promise.resolve(closes++),
    })
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')])
    expect(closes).toBe(1)
  })
})
