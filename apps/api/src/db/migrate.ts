// `bun run db:migrate`: applies pending migrations, then exits. Setup calls it; in production
// run it once per release, before the new version starts (the release or pre-deploy command,
// or a one-off container from the same image). Plain env works (only DATABASE_URL is
// read): without .env.local the script's --env-file is skipped.
import { createDb, migrateDb } from './client'

// DATABASE_URL alone, not the app's env: a release job needs no mail or auth secrets
const url = Bun.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const db = createDb(url)
await migrateDb(db)
await db.$client.close()
console.log('Migrations applied')
