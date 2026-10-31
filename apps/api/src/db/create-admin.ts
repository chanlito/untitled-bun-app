// `bun run db:admin`: makes ADMIN_EMAIL (from .env.local, or the environment) an admin.
// Setup runs it with the email it asked for; on a deploy, run it once with ADMIN_EMAIL set.
// Safe to run again.
import { env } from '../env'
import { ensureAdmin } from '../lib/admin'
import { createAuth } from '../lib/auth'
import { unconfiguredMailer } from '../lib/mailer'
import { createDb } from './client'

if (!env.ADMIN_EMAIL) {
  console.error('ADMIN_EMAIL is not set. Run: bun run setup --admin-email you@example.com')
  process.exit(1)
}

const db = createDb(env.DATABASE_URL)
// Creating a user sends no mail, so no mailer is needed
const result = await ensureAdmin(createAuth({ db, mailer: unconfiguredMailer }), env.ADMIN_EMAIL)
await db.$client.close()
const what = { created: 'created', promoted: 'is now an admin', unchanged: 'already an admin' }
console.log(`Admin ${env.ADMIN_EMAIL} ${what[result]}`)
