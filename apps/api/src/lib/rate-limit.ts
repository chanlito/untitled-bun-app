import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { AppEnv } from './create-router'

// A fixed-window limit per key (the client IP), kept in this process's memory.
// With several API instances each counts on its own, so the effective limit is
// `max` times the instance count; move the counts to Redis or Postgres if that matters.
export function rateLimit({
  max,
  windowMs = 60_000,
  key,
  now = Date.now,
}: {
  max: number
  windowMs?: number
  key: (c: Context<AppEnv>) => string
  now?: () => number
}) {
  const windows = new Map<string, { start: number; count: number }>()
  let lastSweep = now()

  return createMiddleware<AppEnv>(async (c, next) => {
    if (max <= 0) return next()
    const t = now()
    // Drop finished windows now and then, so one-off clients don't pile up
    if (t - lastSweep > windowMs) {
      for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k)
      lastSweep = t
    }

    const k = key(c)
    let w = windows.get(k)
    if (!w || t - w.start >= windowMs) windows.set(k, (w = { start: t, count: 0 }))
    w.count++

    const resetSeconds = Math.ceil((w.start + windowMs - t) / 1000)
    c.header('RateLimit-Limit', String(max))
    c.header('RateLimit-Remaining', String(Math.max(0, max - w.count)))
    c.header('RateLimit-Reset', String(resetSeconds))
    if (w.count > max) {
      c.header('Retry-After', String(resetSeconds))
      return c.json({ message: 'Too many requests' }, 429)
    }
    await next()
  })
}
