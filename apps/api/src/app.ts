import { project } from '@project'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { env } from './env'
import { createRouter } from './lib/create-router'

export function createApp() {
  const app = createRouter()

  app.use(cors({ origin: env.APP_URL, credentials: true }))

  app.notFound((c) => c.json({ message: `Not found: ${c.req.path}` }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ message: err.message }, err.status)
    console.error(err)
    return c.json({ message: 'Internal server error' }, 500)
  })

  app.doc31('/doc', {
    openapi: '3.1.0',
    info: { title: project.name, version: '0.0.0', description: project.description },
  })

  app.get('/reference', Scalar({ url: '/doc', pageTitle: project.name }))

  // Routes chained here make up AppType, the contract the RPC client sees
  const routes = app.get('/health', (c) => c.json({ ok: true }))

  return routes
}

export type AppType = ReturnType<typeof createApp>
