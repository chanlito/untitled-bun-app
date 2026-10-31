import { drizzle } from 'drizzle-orm/bun-sql/postgres'
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

// The common type of the production (Bun.SQL) and test (PGlite) databases
export type Db = PgAsyncDatabase<PgQueryResultHKT>

export const createDb = (url: string): Db => drizzle(url)
