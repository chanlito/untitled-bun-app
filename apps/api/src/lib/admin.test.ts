import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { eq } from 'drizzle-orm'

import { users } from '../db/schema'
import { createTestDb } from '../test/db'
import { ensureAdmin } from './admin'
import { createAuth } from './auth'
import { createMemoryMailer } from './mailer'

let t: Awaited<ReturnType<typeof createTestDb>>
let auth: ReturnType<typeof createAuth>
const roleOf = async (email: string) =>
  (await t.db.select().from(users).where(eq(users.email, email)))[0]?.role

beforeAll(async () => {
  t = await createTestDb()
  auth = createAuth({ db: t.db, mailer: createMemoryMailer() })
})
afterAll(() => t.close())

describe('ensureAdmin', () => {
  test('creates a missing user as an admin, and does nothing the second time', async () => {
    expect(await ensureAdmin(auth, 'New.Admin@example.com')).toBe('created')
    expect(await roleOf('new.admin@example.com')).toBe('admin')
    expect(await ensureAdmin(auth, 'new.admin@example.com')).toBe('unchanged')
  })

  test('adds the admin role to an existing user and keeps their other roles', async () => {
    await t.db.insert(users).values({
      id: Bun.randomUUIDv7(),
      email: 'member@example.com',
      name: 'Member',
      role: 'user',
    })
    expect(await ensureAdmin(auth, 'member@example.com')).toBe('promoted')
    expect(await roleOf('member@example.com')).toBe('user,admin')
  })
})
