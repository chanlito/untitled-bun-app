import { project } from '@project'
import { Scalar } from '@scalar/hono-api-reference'
import { rateLimiter } from 'hono-rate-limiter'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timeout } from 'hono/timeout'

import type { Db } from './db/client'
import { env } from './env'
import { createAuth } from './lib/auth'
import { clientIp, rateLimitKey } from './lib/client-ip'
import { type AppEnv, createRouter } from './lib/create-router'
import { createLogger, type Logger } from './lib/logger'
import type { Mailer } from './lib/mailer'
import { tasksRouter } from './modules/tasks/tasks.index'
import { createServices } from './services'

// Requests larger than this get a 413 before any handler reads them
export const MAX_BODY_BYTES = 1024 * 1024
// A handler still running after this gets a 504; index.ts keeps idle sockets open longer
export const REQUEST_TIMEOUT_MS = 30_000

export type AppOptions = {
  db: Db
  mailer: Mailer
  logger?: Logger
  rateLimitPerMinute?: number
  proxyHops?: number
}

export function createApp({
  db,
  mailer,
  logger = createLogger({ level: env.LOG_LEVEL, format: env.LOG_FORMAT }),
  rateLimitPerMinute = env.RATE_LIMIT_PER_MINUTE,
  proxyHops = env.TRUSTED_PROXY_HOPS,
}: AppOptions) {
  const auth = createAuth({ db, mailer })
  const services = createServices(db)

  const app = createRouter()

  // Echoes a valid incoming X-Request-Id (from a proxy) or makes one, and returns it
  app.use(requestId({ generator: () => Bun.randomUUIDv7() }))

  // One line per request. The path only: query strings can carry tokens (magic links)
  app.use(async (c, next) => {
    const start = performance.now()
    await next()
    const fields = {
      requestId: c.var.requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    }
    if (c.res.status >= 500) logger.error(fields, 'request')
    else logger.info(fields, 'request')
  })

  // Hono's defaults: HSTS, nosniff, frame denial, no referrer leaks, and so on. No CSP:
  // this serves JSON and Scalar's page, which loads its script from a CDN.
  app.use(secureHeaders())

  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true,
      // Tokens browser clients need to read: the session (bearer plugin) and a JWT (jwt plugin)
      exposeHeaders: ['set-auth-token', 'set-auth-jwt'],
    }),
  )
  // Resolved before bodyLimit, which can swap c.req.raw for a copy that Bun's
  // server.requestIP() no longer knows
  app.use(async (c, next) => {
    c.set('clientIp', clientIp(c, { proxyHops }))
    await next()
  })

  // Better Auth limits its own routes; everything else is limited here, before any body is
  // read. /health is left out so load balancer probes, all from one address, never trip it.
  // API-key clients count here too, so raise RATE_LIMIT_PER_MINUTE for heavy server-to-server use.
  app.use(
    rateLimiter<AppEnv>({
      windowMs: 60_000,
      limit: rateLimitPerMinute,
      standardHeaders: 'draft-6',
      keyGenerator: (c) => rateLimitKey(c.var.clientIp),
      skip: (c) =>
        rateLimitPerMinute <= 0 || c.req.path === '/health' || c.req.path.startsWith('/api/auth/'),
      message: { message: 'Too many requests' },
    }),
  )

  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ message: 'Request body too large' }, 413),
    }),
  )
  // The 504 doesn't stop the handler: work it started (a DB write) can still finish after
  app.use(
    timeout(REQUEST_TIMEOUT_MS, () => new HTTPException(504, { message: 'Request timed out' })),
  )

  app.use(async (c, next) => {
    c.set('auth', auth)
    c.set('services', services)
    await next()
  })

  app.notFound((c) => c.json({ message: `Not found: ${c.req.path}` }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // An exception built with its own response (headers such as WWW-Authenticate) keeps it
      if (err.res) return err.getResponse()
      return c.json({ message: err.message || 'Request failed' }, err.status)
    }
    logger.error({ requestId: c.var.requestId, err }, 'unhandled error')
    return c.json({ message: 'Internal server error' }, 500)
  })

  // Better Auth reads the client IP (for its rate limits and sessions) from x-client-ip
  // alone, set here from our own resolution so a client can't choose it
  app.on(['GET', 'POST'], '/api/auth/*', (c) => {
    const headers = new Headers(c.req.raw.headers)
    headers.set('x-client-ip', c.var.clientIp)
    return auth.handler(new Request(c.req.raw, { headers }))
  })

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
