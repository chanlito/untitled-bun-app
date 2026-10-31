import { createApp } from './app'
import { createDb, migrateDb } from './db/client'
import { env } from './env'
import { createMailpitMailer, unconfiguredMailer } from './lib/mailer'

// Mailpit only when explicitly configured (.env.example sets it for development), so a
// deploy that forgets NODE_ENV fails closed instead of logging sign-in codes
const mailer = env.MAILPIT_URL
  ? createMailpitMailer({ url: env.MAILPIT_URL, from: env.MAIL_FROM })
  : unconfiguredMailer

const db = createDb(env.DATABASE_URL)
await migrateDb(db)

const app = createApp({ db, mailer })

const server = Bun.serve({ port: env.PORT, fetch: app.fetch })

console.log(`API on ${server.url} (docs: ${server.url}reference)`)
