import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestApp, type TestApp } from '../test/app'
import { createTask, signedIn } from '../test/factories'

let t: TestApp
beforeAll(async () => (t = await createTestApp()))
afterAll(() => t.close())

// signedIn covers bearer tokens; these cover the other two ways requireUser finds a user
describe('requireUser', () => {
  test('an API key (x-api-key) acts as its owner, beyond the plugin default of 10 a day', async () => {
    const alice = await signedIn(t)
    await createTask(t, alice.user.id, 'Visible to the key')

    const created = await t.app.request('/api/auth/api-key/create', {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    })
    const { key } = (await created.json()) as { key: string }

    for (let i = 0; i < 12; i++) {
      const res = await t.client.tasks.$get({}, { headers: { 'x-api-key': key } })
      expect(res.status).toBe(200)
    }
    const res = await t.client.tasks.$get({}, { headers: { 'x-api-key': key } })
    expect(await res.json()).toMatchObject([{ title: 'Visible to the key' }])
  })

  test('the session cookie from sign-in works', async () => {
    const email = `cookie-${Bun.randomUUIDv7()}@example.com`
    const post = (path: string, body: object) =>
      t.app.request(`/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
    const otp = t.mailer.sent.findLast((m) => m.to === email)?.text.match(/\d{6}/)?.[0]
    const signIn = await post('/sign-in/email-otp', { email, otp })
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

    const res = await t.client.tasks.$get({}, { headers: { cookie } })
    expect(res.status).toBe(200)
  })

  test('a bad API key is a 401', async () => {
    const res = await t.client.tasks.$get({}, { headers: { 'x-api-key': 'nope' } })
    expect(res.status).toBe(401)
  })
})
