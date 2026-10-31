import { Scalar } from '@scalar/hono-api-reference'
import { config } from '@untitled-bun-app/config'
import { rateLimiter } from 'hono-rate-limiter'
import { accepts } from 'hono/accepts'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { timeout } from 'hono/timeout'

import type { Db } from './db/client'
import { createReadinessCheck } from './db/readiness'
import { env } from './env'
import { apiIntro } from './lib/api-docs'
import { createAuth } from './lib/auth'
import { clientIp, rateLimitKey } from './lib/client-ip'
import { type AppEnv, createRouter } from './lib/create-router'
import { LANDING_CSP, landingJson, landingPage } from './lib/landing-page'
import { createLogger, type Logger } from './lib/logger'
import type { Mailer } from './lib/mailer'
import { tasksRouter } from './modules/tasks/tasks.index'
import { createServices } from './services'

// Requests larger than this get a 413 before any handler reads them
export const MAX_BODY_BYTES = 1024 * 1024
// A handler still running after this gets a 504; index.ts keeps idle sockets open longer
export const REQUEST_TIMEOUT_MS = 30_000
// The API's version, in the OpenAPI spec and on the landing page. Bump it when you release.
export const API_VERSION = '0.0.0'

export type AppOptions = {
  db: Db
  mailer: Mailer
  logger?: Logger
  rateLimitPerMinute?: number
  proxyHops?: number
  // Aborted when the server starts shutting down: /ready then answers 503 (index.ts)
  shutdownSignal?: AbortSignal
}

export function createApp({
  db,
  mailer,
  logger = createLogger({ level: env.LOG_LEVEL, format: env.LOG_FORMAT }),
  rateLimitPerMinute = env.RATE_LIMIT_PER_MINUTE,
  proxyHops = env.TRUSTED_PROXY_HOPS,
  shutdownSignal,
}: AppOptions) {
  const auth = createAuth({ db, mailer })
  const services = createServices(db)
  const readiness = createReadinessCheck(db, { logger })

  const app = createRouter()

  // Echoes a valid incoming X-Request-Id (from a proxy) or makes one, and returns it
  app.use(requestId({ generator: () => Bun.randomUUIDv7() }))

  // One line per request. The path only: query strings can carry tokens (magic links).
  // Probes, sent every few seconds, only when something unexpected happened: /ready logs
  // why it answered 503 itself, once per check.
  app.use(async (c, next) => {
    const start = performance.now()
    await next()
    if (PROBES.has(c.req.path) && (c.res.ok || c.res.status === 503)) return
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

  // Hono's defaults: HSTS, nosniff, frame denial, no referrer leaks, and so on. No global CSP:
  // Scalar's page loads its script from a CDN. The landing page at / sets its own strict one.
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
  // read. /health and /ready are left out so probes, all from one address, never trip them.
  // API-key clients count here too, so raise RATE_LIMIT_PER_MINUTE for heavy server-to-server use.
  app.use(
    rateLimiter<AppEnv>({
      windowMs: 60_000,
      limit: rateLimitPerMinute,
      standardHeaders: 'draft-6',
      keyGenerator: (c) => rateLimitKey(c.var.clientIp),
      skip: (c) =>
        rateLimitPerMinute <= 0 || PROBES.has(c.req.path) || c.req.path.startsWith('/api/auth/'),
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
    description:
      'A session token: sign in with an email code and read it from the `set-auth-token` response header. See Authentication above.',
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'apiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
    description:
      'An API key from `POST /api/auth/api-key/create`. It acts as the user who created it. See Authentication above.',
  })

  app.doc31('/doc', {
    openapi: '3.1.0',
    info: {
      title: `${config.name} API`,
      version: API_VERSION,
      description: apiIntro({
        apiUrl: env.API_URL,
        maxBodyBytes: MAX_BODY_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        rateLimitPerMinute,
      }),
    },
    servers: [{ url: env.API_URL }],
    tags: [{ name: 'Tasks', description: 'Your to-do items. You only ever see your own.' }],
  })

  // Browsers get a small page with links to the docs; everything else (curl's */*, fetch,
  // monitors) gets the same links as JSON. Kept out of AppType and the spec, like /reference.
  app.get('/', (c) => {
    const info = { apiUrl: env.API_URL, version: API_VERSION, environment: env.NODE_ENV }
    c.header('Vary', 'Accept')
    const type = accepts(c, {
      header: 'Accept',
      supports: ['application/json', 'text/html'],
      default: 'application/json',
    })
    if (type !== 'text/html') return c.json(landingJson(info))
    c.header('Content-Security-Policy', LANDING_CSP)
    return c.html(landingPage(info))
  })

  app.get(
    '/reference',
    Scalar({
      pageTitle: config.name,
      // Pinned (as the ESM bundle, not cdn): the hidden footer relies on this release's markup
      bundle: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4/esm.js',
      showDeveloperTools: 'never',
      agent: { disabled: true },
      // Scalar has no option for its footer credit, so hide its link
      customCss: 'a[href*="utm_source=powered-by"] { display: none; }',
      sources: [
        { url: '/doc', title: config.name },
        { url: '/api/auth/open-api/generate-schema', title: 'Auth' },
      ],
    }),
  )

  // Routes chained here make up AppType, the contract the RPC client sees.
  // /health is liveness: the process answers, nothing else is checked, so a database outage
  // never gets the server restarted. /ready is readiness, for routing traffic: 503 until the
  // database answers and has every migration this build ships with (db/readiness.ts), and
  // again from the moment shutdown starts.
  const routes = app
    .get('/health', (c) => c.json({ ok: true }))
    .get('/ready', async (c) => {
      if (shutdownSignal?.aborted) return c.json({ ok: false, reason: 'shutting down' }, 503)
      const result = await readiness()
      return result.ok ? c.json(result, 200) : c.json(result, 503)
    })
    .route('/', tasksRouter)

  return routes
}

// Health probes: not rate limited, since they all come from one address (/ready caches its
// answer, so it can't be used to load the database), and not request-logged
const PROBES = new Set(['/health', '/ready'])

export type AppType = ReturnType<typeof createApp>
