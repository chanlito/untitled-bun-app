import { testClient } from 'hono/testing'

import { createApp } from '../app'
import { createMemoryMailer } from '../lib/mailer'
import { createTestDb } from './db'

// A fresh app on its own database. Call once per test file:
//   const t = await createTestApp()
//   afterAll(() => t.close())
export async function createTestApp() {
  const { db, close } = await createTestDb()
  const mailer = createMemoryMailer()
  const app = createApp({ db, mailer })
  return { app, client: testClient(app), db, mailer, close }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>
