import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'

import type { Logger } from '../lib/logger'
import { type Db, migrationsFolder } from './client'

export type Readiness = { ok: true } | { ok: false; reason: string }

// The migrations this build ships with, named as drizzle's migrator records them
export const shippedMigrations = () => readMigrationFiles({ migrationsFolder }).map((m) => m.name)

// Ready means the database answers within `timeoutMs` and has every migration this build
// ships with, so a server whose release step hasn't run yet never gets traffic.
//
// /ready is public and unlimited, so one check runs at a time and its answer is reused for
// `cacheMs` after it finishes. Each check gives up after `timeoutMs` on the server too
// (statement_timeout), so a slow database can't collect abandoned probe queries. Once the
// schema is seen up to date, checks only ping. Failures are logged once per check.
export function createReadinessCheck(
  db: Db,
  {
    logger,
    timeoutMs = 2_000,
    cacheMs = 1_000,
    migrations = shippedMigrations,
  }: { logger?: Logger; timeoutMs?: number; cacheMs?: number; migrations?: () => string[] } = {},
) {
  let shipped: string[] | undefined
  let migrated = false
  let running: Promise<Readiness> | undefined
  let cached: { until: number; result: Readiness } | undefined

  async function check(): Promise<Readiness> {
    try {
      shipped ??= migrations()
    } catch (err) {
      logger?.error({ err }, 'not ready: the migrations folder is unreadable')
      return { ok: false, reason: 'migrations unreadable' }
    }
    try {
      const pending = await withTimeout(
        pendingMigrations(db, migrated ? [] : shipped, timeoutMs),
        timeoutMs,
      )
      if (pending.length) {
        logger?.warn({ pending }, 'not ready: run `bun run db:migrate`')
        return { ok: false, reason: 'migrations pending' }
      }
      migrated = true
      return { ok: true }
    } catch (err) {
      logger?.warn({ err }, 'not ready: the database is unavailable')
      return { ok: false, reason: 'database unavailable' }
    }
  }

  return (): Promise<Readiness> => {
    if (cached && performance.now() < cached.until) return Promise.resolve(cached.result)
    running ??= check().then((result) => {
      cached = { until: performance.now() + cacheMs, result }
      running = undefined
      return result
    })
    return running
  }
}

// With no migrations to look for, only pings
async function pendingMigrations(db: Db, migrations: string[], timeoutMs: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local statement_timeout = ${Math.ceil(timeoutMs)}`))
    if (!migrations.length) {
      await tx.execute(sql`select 1`)
      return []
    }
    const [table] = rows<{ name: string | null }>(
      await tx.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`),
    )
    if (!table?.name) return migrations
    const applied = rows<{ name: string }>(
      await tx.execute(sql`select name from drizzle.__drizzle_migrations`),
    )
    const names = new Set(applied.map((row) => row.name))
    return migrations.filter((name) => !names.has(name))
  })
}

// Bun.SQL returns the rows as an array, PGlite (tests) as { rows }
function rows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[]
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: Timer | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
