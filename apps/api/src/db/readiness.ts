import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'

import { type Db, migrationsFolder } from './client'

export type Readiness = { ok: true } | { ok: false; reason: string; error?: unknown }

// The migrations this build ships with, named as drizzle's migrator records them
export const shippedMigrations = () => readMigrationFiles({ migrationsFolder }).map((m) => m.name)

// Ready means the database answers within `timeoutMs` and has every migration this build
// ships with, so a server whose release step hasn't run yet never gets traffic. /ready is
// public and unlimited, so the database is asked at most once per `cacheMs`: requests in
// that window, or while a check is running, share its answer.
export function createReadinessCheck(
  db: Db,
  { timeoutMs = 2_000, cacheMs = 1_000, migrations = shippedMigrations } = {},
) {
  let last: { at: number; result: Promise<Readiness> } | undefined
  return (): Promise<Readiness> => {
    const now = performance.now()
    if (!last || now - last.at >= cacheMs) {
      last = { at: now, result: check(db, migrations, timeoutMs) }
    }
    return last.result
  }
}

async function check(db: Db, migrations: () => string[], timeoutMs: number): Promise<Readiness> {
  try {
    const pending = await withTimeout(pendingMigrations(db, migrations()), timeoutMs)
    if (pending.length) return { ok: false, reason: 'migrations pending' }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'database unavailable', error }
  }
}

export async function pendingMigrations(db: Db, migrations: string[]) {
  const [table] = rows<{ name: string | null }>(
    await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`),
  )
  if (!table?.name) return migrations
  const applied = rows<{ name: string }>(
    await db.execute(sql`select name from drizzle.__drizzle_migrations`),
  )
  const names = new Set(applied.map((row) => row.name))
  return migrations.filter((name) => !names.has(name))
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
