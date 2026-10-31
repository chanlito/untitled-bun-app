import { testClient } from 'hono/testing'
import { type AppOptions, createApp } from '../app'
import { createMemoryLogger } from '../lib/logger'
import { createMemoryMailer } from '../lib/mailer'
import { createTestDb } from './db'

// A fresh app on its own database. Call once per test file:
//   const t = await createTestApp()
//   afterAll(() => t.close())
// Options override createApp's env-based ones, e.g. { rateLimitPerMinute: 2 }.
export async function createTestApp(options: Omit<AppOptions, 'db' | 'mailer' | 'logger'> = {}) {
  const { db, close } = await createTestDb()
  const mailer = createMemoryMailer()
  const logger = createMemoryLogger()
  const app = createApp({ db, mailer, logger, ...options })
  return { app, client: testClient(app), db, mailer, logger, close }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>
