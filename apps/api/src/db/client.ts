import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sql/postgres'
import { migrate } from 'drizzle-orm/bun-sql/postgres/migrator'
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

// The common type of the production (Bun.SQL) and test (PGlite) databases
export type Db = PgAsyncDatabase<PgQueryResultHKT>

// import.meta.dir is decoded, so paths with spaces work (URL.pathname keeps %20)
export const migrationsFolder = join(import.meta.dir, '../../drizzle')

// The concrete Bun.SQL database: the server, migrate and seed all build theirs here
export const createDb = (url: string) => drizzle(url)

export const migrateDb = (db: ReturnType<typeof createDb>) => migrate(db, { migrationsFolder })
