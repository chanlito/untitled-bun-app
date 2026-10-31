// `bun run db:admin`: makes ADMIN_EMAIL (from .env.local, or the environment) an admin.
// Setup runs it with the email it asked for; on a deploy, run it once with ADMIN_EMAIL set.
// Safe to run again. Checked here, not in env.ts: a bad value must never stop the API.
import { z } from 'zod'

import { env } from '../env'
import { ensureAdmin } from '../lib/admin'
import { createAuth } from '../lib/auth'
import { unconfiguredMailer } from '../lib/mailer'
import { createDb } from './client'

const email = z.email().toLowerCase().safeParse(Bun.env.ADMIN_EMAIL)
if (!email.success) {
  console.error(
    Bun.env.ADMIN_EMAIL
      ? `ADMIN_EMAIL "${Bun.env.ADMIN_EMAIL}" is not a valid email address`
      : 'ADMIN_EMAIL is not set. Run: bun run setup --admin-email you@example.com',
  )
  process.exit(1)
}

const db = createDb(env.DATABASE_URL)
// Creating a user sends no mail, so no mailer is needed
const result = await ensureAdmin(createAuth({ db, mailer: unconfiguredMailer }), email.data)
await db.$client.close()
const what = { created: 'created', promoted: 'is now an admin', unchanged: 'already an admin' }
console.log(`Admin ${email.data} ${what[result]}`)
