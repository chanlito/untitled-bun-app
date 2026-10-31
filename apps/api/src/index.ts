import { createApp } from './app'
import { createDb } from './db/client'
import { env } from './env'
import { createMailpitMailer, unconfiguredMailer } from './lib/mailer'

const mailer =
  env.NODE_ENV === 'production'
    ? unconfiguredMailer
    : createMailpitMailer({ url: env.MAILPIT_URL, from: env.MAIL_FROM })

const app = createApp({ db: createDb(env.DATABASE_URL), mailer })

const server = Bun.serve({ port: env.PORT, fetch: app.fetch })

console.log(`API on ${server.url} (docs: ${server.url}reference)`)
