import { migrate } from 'drizzle-orm/bun-sql/postgres/migrator'
import { drizzle } from 'drizzle-orm/bun-sql/postgres'
import { env } from '../env'

export const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

// `bun run db:migrate`, also called by setup
if (import.meta.main) {
  const db = drizzle(env.DATABASE_URL)
  await migrate(db, { migrationsFolder })
  await db.$client.close()
  console.log('Migrations applied')
}
