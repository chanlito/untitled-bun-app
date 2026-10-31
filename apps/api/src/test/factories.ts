import { eq } from 'drizzle-orm'
import { tasks, users } from '../db/schema'
import type { TestApp } from './app'

const uniqueEmail = () => `user-${Bun.randomUUIDv7()}@example.com`

// Signs in through the real email-OTP flow and returns bearer headers for that user
export async function signedIn(t: TestApp, { role = 'user' }: { role?: 'user' | 'admin' } = {}) {
  const email = uniqueEmail()
  const post = (path: string, body: object) =>
    t.app.request(`/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const otp = t.mailer.sent.findLast((m) => m.to === email)?.text.match(/\d{6}/)?.[0]
  if (!otp) throw new Error(`No OTP was sent to ${email}`)

  const res = await post('/sign-in/email-otp', { email, otp })
  const token = res.headers.get('set-auth-token')
  if (!res.ok || !token) throw new Error(`Sign-in failed (${res.status}): ${await res.text()}`)

  const { user } = (await res.json()) as { user: typeof users.$inferSelect }
  if (role !== 'user') await t.db.update(users).set({ role }).where(eq(users.id, user.id))

  return { user, headers: { authorization: `Bearer ${token}` } }
}

export async function createTask(t: TestApp, userId: string, title = 'A task') {
  const [task] = await t.db
    .insert(tasks)
    .values({ id: Bun.randomUUIDv7(), userId, title })
    .returning()
  return task!
}
