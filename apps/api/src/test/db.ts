import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import { type Db, migrationsFolder } from '../db/client'

// Booting PGlite and migrating costs ~2 s, so it happens once per `bun test` run.
// Every test database is a copy of this migrated, empty template (~200 ms).
let template: Promise<File | Blob> | undefined

async function buildTemplate() {
  const client = new PGlite()
  await migrate(drizzle({ client }), { migrationsFolder })
  const dump = await client.dumpDataDir('none')
  await client.close()
  return dump
}

export async function createTestDb() {
  template ??= buildTemplate()
  const client = new PGlite({ loadDataDir: await template })
  const db: Db = drizzle({ client })
  // Close it in afterAll: an open PGlite keeps the test process alive
  return { db, close: () => client.close() }
}
