import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createTestApp, type TestApp } from '../../test/app'
import { createTask, signedIn } from '../../test/factories'

let t: TestApp
beforeAll(async () => (t = await createTestApp()))
afterAll(() => t.close())

describe('tasks routes', () => {
  test('401 without credentials', async () => {
    const res = await t.client.tasks.$get()
    expect(res.status).toBe(401)
  })

  test('create, list, update and delete my tasks', async () => {
    const alice = await signedIn(t)
    const opts = { headers: alice.headers }

    // Responses are typed unions per status; checking `ok` narrows the body
    const created = await t.client.tasks.$post({ json: { title: 'Write tests' } }, opts)
    if (!created.ok) throw new Error(`create failed: ${created.status}`)
    expect(created.status).toBe(201)
    const task = await created.json()
    expect(task).toMatchObject({ title: 'Write tests', done: false })

    const list = await t.client.tasks.$get({}, opts)
    expect(await list.json()).toEqual([task])

    const updated = await t.client.tasks[':id'].$patch(
      { param: { id: task.id }, json: { done: true } },
      opts,
    )
    expect(await updated.json()).toMatchObject({ id: task.id, done: true })

    const removed = await t.client.tasks[':id'].$delete({ param: { id: task.id } }, opts)
    expect(removed.status).toBe(204)
    const gone = await t.client.tasks[':id'].$get({ param: { id: task.id } }, opts)
    expect(gone.status).toBe(404)
  })

  test("another user's task is a 404, not a 403", async () => {
    const alice = await signedIn(t)
    const bob = await signedIn(t)
    const bobs = await createTask(t, bob.user.id)

    const res = await t.client.tasks[':id'].$get(
      { param: { id: bobs.id } },
      { headers: alice.headers },
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ message: 'Task not found' })
  })

  test('422 with issues for an empty title', async () => {
    const alice = await signedIn(t)
    const res = await t.client.tasks.$post({ json: { title: '  ' } }, { headers: alice.headers })
    if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`)
    const body = await res.json()
    expect(body.message).toBe('Validation failed')
    expect(body.issues[0]?.path).toBe('title')
  })

  test('422 for an update with nothing to change', async () => {
    const alice = await signedIn(t)
    const task = await createTask(t, alice.user.id)
    const res = await t.client.tasks[':id'].$patch(
      { param: { id: task.id }, json: {} },
      { headers: alice.headers },
    )
    expect(res.status).toBe(422)
  })
})
