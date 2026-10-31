import { createApp, REQUEST_TIMEOUT_MS } from './app'
import { createDb, migrateDb } from './db/client'
import { env } from './env'
import { createLogger } from './lib/logger'
import { createMailpitMailer, unconfiguredMailer } from './lib/mailer'

const logger = createLogger({ level: env.LOG_LEVEL, format: env.LOG_FORMAT })

// Mailpit only when explicitly configured (.env.example sets it for development), so a
// deploy that forgets NODE_ENV fails closed instead of logging sign-in codes
const mailer = env.MAILPIT_URL
  ? createMailpitMailer({ url: env.MAILPIT_URL, from: env.MAIL_FROM })
  : unconfiguredMailer

const db = createDb(env.DATABASE_URL)
await migrateDb(db)

const app = createApp({ db, mailer, logger })

const server = Bun.serve({
  port: env.PORT,
  // The server is passed on as c.env, so lib/client-ip.ts can read the socket address
  fetch: (req, server) => app.fetch(req, server),
  // Seconds. Above the request timeout, so a slow handler gets its 504 instead of a reset
  idleTimeout: Math.ceil(REQUEST_TIMEOUT_MS / 1000) + 5,
})

logger.info({ url: server.url.href, docs: `${server.url.href}reference` }, 'API listening')
