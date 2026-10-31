import { createApp } from './app'
import { createDb } from './db/client'
import { env } from './env'
import { createMailpitMailer } from './lib/mailer'

const app = createApp({
  db: createDb(env.DATABASE_URL),
  mailer: createMailpitMailer({ url: env.MAILPIT_URL, from: env.MAIL_FROM }),
})

const server = Bun.serve({ port: env.PORT, fetch: app.fetch })

console.log(`API on ${server.url} (docs: ${server.url}reference)`)
