import { join } from 'node:path'
import { migrate } from 'drizzle-orm/bun-sql/postgres/migrator'
import { drizzle } from 'drizzle-orm/bun-sql/postgres'
import { env } from '../env'

// import.meta.dir is decoded, so paths with spaces work (URL.pathname keeps %20)
export const migrationsFolder = join(import.meta.dir, '../../drizzle')

// `bun run db:migrate`, also called by setup
if (import.meta.main) {
  const db = drizzle(env.DATABASE_URL)
  await migrate(db, { migrationsFolder })
  await db.$client.close()
  console.log('Migrations applied')
}
