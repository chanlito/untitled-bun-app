import { createApp, REQUEST_TIMEOUT_MS } from './app'
import { createDb, migrateDb } from './db/client'
import { env } from './env'
import { createShutdown } from './lib/graceful-shutdown'
import { createLogger } from './lib/logger'
import { createMailpitMailer, unconfiguredMailer } from './lib/mailer'

const logger = createLogger({ level: env.LOG_LEVEL, format: env.LOG_FORMAT })

// Signal handlers come first: in a container the server is PID 1, which ignores a signal it
// has no handler for, so a SIGTERM during startup would wait out the platform's kill timer.
// Before the server listens there is nothing to drain, so a signal just exits. Repeats join
// the shutdown already running (`bun run` forwards Ctrl-C, so one press arrives twice).
// `bun --hot` runs this file again on each change: the handlers are added once and call the
// shutdown of the latest run.
type Running = { shutdown?: (reason: string) => Promise<void>; listening?: boolean }
const running = ((globalThis as { __api?: Running }).__api ??= {})
running.shutdown = undefined
if (!running.listening) {
  running.listening = true
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (!running.shutdown) process.exit(0)
      running.shutdown(signal).then(
        () => process.exit(0),
        (err: unknown) => {
          logger.error({ err }, 'shutdown failed')
          process.exit(1)
        },
      )
    })
  }
}

// Mailpit only when explicitly configured (.env.example sets it for development), so a
// deploy that forgets NODE_ENV fails closed instead of logging sign-in codes
const mailer = env.MAILPIT_URL
  ? createMailpitMailer({ url: env.MAILPIT_URL, from: env.MAIL_FROM })
  : unconfiguredMailer

const db = createDb(env.DATABASE_URL)
// Off in production by default: `bun run db:migrate` runs once per release there (env.ts)
if (env.MIGRATE_ON_START) {
  await migrateDb(db)
  logger.info('migrations applied')
}

const shutdownController = new AbortController()
const app = createApp({ db, mailer, logger, shutdownSignal: shutdownController.signal })

const server = Bun.serve({
  port: env.PORT,
  // The server is passed on as c.env, so lib/client-ip.ts can read the socket address
  fetch: (req, server) => app.fetch(req, server),
  // Seconds. Above the request timeout, so a slow handler gets its 504 instead of a reset
  idleTimeout: Math.ceil(REQUEST_TIMEOUT_MS / 1000) + 5,
})

logger.info({ url: server.url.href, docs: `${server.url.href}reference` }, 'API listening')

running.shutdown = createShutdown({
  server,
  controller: shutdownController,
  logger,
  delayMs: env.SHUTDOWN_DELAY_MS,
  graceMs: env.SHUTDOWN_GRACE_MS,
  // Requests are done by now: whatever query is still open (a probe) gets a second
  close: () => db.$client.close({ timeout: 1 }),
})
