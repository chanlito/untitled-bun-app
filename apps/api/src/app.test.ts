import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { project } from '@project'

import { createTestApp, type TestApp } from './test/app'

let t: TestApp
beforeAll(async () => (t = await createTestApp()))
afterAll(() => t.close())

describe('app', () => {
  test('GET /health returns ok', async () => {
    const res = await t.client.health.$get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('unknown routes return 404 { message }', async () => {
    const res = await t.app.request('/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ message: 'Not found: /nope' })
  })

  test('GET /doc serves an OpenAPI 3.1 spec titled after the project', async () => {
    const res = await t.app.request('/doc')
    const spec = (await res.json()) as { openapi: string; info: { title: string } }
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info.title).toBe(`${project.name} API`)
  })

  test('the spec explains itself to outside developers', async () => {
    const spec = (await (await t.app.request('/doc')).json()) as {
      info: { description: string }
      servers: { url: string }[]
      paths: Record<string, Record<string, { operationId?: string; description?: string }>>
    }
    expect(spec.servers).toHaveLength(1)
    for (const heading of ['## Authentication', '## Errors', '## Rate limits', '## Request IDs']) {
      expect(spec.info.description).toContain(heading)
    }
    // Every endpoint gets a stable operationId (for generated clients) and a description
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        expect({
          route: `${method} ${path}`,
          id: !!op.operationId,
          text: !!op.description,
        }).toEqual({
          route: `${method} ${path}`,
          id: true,
          text: true,
        })
      }
    }
  })

  test('GET /reference serves the Scalar UI', async () => {
    const res = await t.app.request('/reference')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  test('the Scalar UI hides its developer tools, AI agent and footer credit', async () => {
    const html = (await (await t.app.request('/reference')).text()).replace(/\s/g, '')
    // A cdn URL would switch Scalar to its UMD loader, which can't load esm.js: the page goes blank
    expect(html).toContain(
      "import{createApiReference}from'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4/esm.js'",
    )
    expect(html).toContain('"showDeveloperTools":"never"')
    expect(html).toContain('"agent":{"disabled":true}')
    expect(html).toContain('a[href*=\\"utm_source=powered-by\\"]{display:none;}')
  })

  test("the auth spec is served for Scalar's second source", async () => {
    const res = await t.app.request('/api/auth/open-api/generate-schema')
    expect(res.status).toBe(200)
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(Object.keys(spec.paths)).toContain('/sign-in/email-otp')
  })
})
