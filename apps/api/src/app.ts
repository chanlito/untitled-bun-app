import { project } from '@project'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { Db } from './db/client'
import { env } from './env'
import { createAuth } from './lib/auth'
import { createRouter } from './lib/create-router'
import type { Mailer } from './lib/mailer'
import { tasksRouter } from './modules/tasks/tasks.index'
import { createServices } from './services'

export function createApp({ db, mailer }: { db: Db; mailer: Mailer }) {
  const auth = createAuth({ db, mailer })
  const services = createServices(db)

  const app = createRouter()

  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true,
      // The bearer plugin returns the session token in this header after sign-in
      exposeHeaders: ['set-auth-token'],
    }),
  )
  app.use(async (c, next) => {
    c.set('auth', auth)
    c.set('services', services)
    await next()
  })

  app.notFound((c) => c.json({ message: `Not found: ${c.req.path}` }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ message: err.message }, err.status)
    console.error(err)
    return c.json({ message: 'Internal server error' }, 500)
  })

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    description: 'Session token from the `set-auth-token` header after sign-in',
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'apiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
  })

  app.doc31('/doc', {
    openapi: '3.1.0',
    info: { title: project.name, version: '0.0.0', description: project.description },
  })

  app.get(
    '/reference',
    Scalar({
      pageTitle: project.name,
      sources: [
        { url: '/doc', title: project.name },
        { url: '/api/auth/open-api/generate-schema', title: 'Auth' },
      ],
    }),
  )

  // Routes chained here make up AppType, the contract the RPC client sees
  const routes = app.get('/health', (c) => c.json({ ok: true })).route('/', tasksRouter)

  return routes
}

export type AppType = ReturnType<typeof createApp>
