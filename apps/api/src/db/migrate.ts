// `bun run db:migrate`: applies pending migrations, then exits. Setup calls it; in production
// run it once per release, before the new version starts (the release or pre-deploy command,
// or a one-off container from the same image). Plain env works: without .env.local the
// script's --env-file is skipped.
import { env } from '../env'
import { createDb, migrateDb } from './client'

const db = createDb(env.DATABASE_URL)
await migrateDb(db)
await db.$client.close()
console.log('Migrations applied')
