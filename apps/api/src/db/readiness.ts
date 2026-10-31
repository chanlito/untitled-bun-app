import { readdirSync } from 'node:fs'

import { sql } from 'drizzle-orm'

import { type Db, migrationsFolder } from './client'

export type Readiness = { ok: true } | { ok: false; reason: string }

// The migrations this build ships with: one folder each in apps/api/drizzle
const shippedMigrations = () =>
  readdirSync(migrationsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

// Ready means the database answers and has every migration this build ships with, so a
// server whose release step hasn't run yet never gets traffic. Once the schema is seen up
// to date, later checks only ping. Each check gives up after `timeoutMs`, on the server
// too (statement_timeout), so slow probes can't pile up and hold pool connections.
export function createReadinessCheck(
  db: Db,
  { timeoutMs = 2_000, migrations = shippedMigrations() } = {},
) {
  let migrated = false
  return async (): Promise<Readiness> => {
    try {
      const pending = await withTimeout(
        db.transaction(async (tx) => {
          await tx.execute(sql.raw(`set local statement_timeout = ${Math.ceil(timeoutMs)}`))
          if (migrated) {
            await tx.execute(sql`select 1`)
            return []
          }
          const table = rows<{ name: string | null }>(
            await tx.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`),
          )
          if (!table[0]?.name) return migrations
          const applied = rows<{ name: string }>(
            await tx.execute(sql`select name from drizzle.__drizzle_migrations`),
          )
          const names = new Set(applied.map((row) => row.name))
          return migrations.filter((name) => !names.has(name))
        }),
        timeoutMs,
      )
      if (pending.length) return { ok: false, reason: 'migrations pending' }
      migrated = true
      return { ok: true }
    } catch {
      return { ok: false, reason: 'database unavailable' }
    }
  }
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
