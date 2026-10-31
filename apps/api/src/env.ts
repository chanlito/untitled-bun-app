import { z } from 'zod'

const NODE_ENV = z.enum(['development', 'test', 'production']).default('development')

// Only `bun test` gets a built-in secret. Everywhere else it must be set
// (setup generates one into .env.local), so a deploy that forgets it fails to start.
const TEST_SECRET = 'test-only-secret-never-used-outside-bun-test'

// The localhost defaults suit development only: production must name them, so a
// deploy that forgets one fails to start instead of pointing at localhost
const REQUIRED_IN_PRODUCTION = ['API_URL', 'APP_URL', 'DATABASE_URL'] as const

// Mailpit's SMTP port in docker-compose.yml
const DEV_SMTP_URL = 'smtp://localhost:3146'

const unsetIfEmpty = (value: unknown) => (value === '' ? undefined : value)

const Env = z.object({
  NODE_ENV,
  PORT: z.coerce.number().int().positive().default(3141),
  API_URL: z.url().default('http://localhost:3141'),
  // Normalised to an origin: CORS and Better Auth compare it verbatim with the Origin header
  APP_URL: z
    .url()
    .default('http://localhost:3142')
    .transform((url) => new URL(url).origin),
  DATABASE_URL: z.url().default('postgres://app:app@localhost:3143/app'),
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // The SMTP server mail goes through, as smtp://user:pass@host:587 or smtps://…:465.
  // Default: Mailpit from docker-compose.yml, outside production only. Production without
  // it starts, but every email (sign-in codes included) fails until it is set.
  SMTP_URL: z.preprocess(
    unsetIfEmpty,
    z.url({ protocol: /^smtps?$/, error: 'must be an smtp:// or smtps:// URL' }).optional(),
  ),
  MAIL_FROM: z.email().default('no-reply@example.com'),
  // Defaults: info, as JSON lines in production and readable lines elsewhere; silent in tests
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  // How many reverse proxies you control sit in front (a load balancer is 1, a CDN in
  // front of it 2). The client IP is read from X-Forwarded-For only that far; at 0 the
  // header is ignored, since any client can send it.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  // Requests per client IP per minute to the API's own routes (/api/auth has its own limits)
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().nonnegative().default(300),
  // Apply pending migrations when the server starts. Default: on outside production. In
  // production run `bun run db:migrate` once per release instead, so replicas starting
  // together don't race; set it to true for a single instance that should migrate itself.
  // /ready answers 503 while any migration is pending, so traffic waits for it either way.
  // An empty value means unset, as with the other keys .env files list without a value
  MIGRATE_ON_START: z.preprocess(unsetIfEmpty, z.stringbool().optional()),
  // On SIGTERM, how long /ready answers 503 while the server still takes new connections,
  // so load balancers stop routing to it first (Kubernetes, ECS, Fly: a few seconds)
  SHUTDOWN_DELAY_MS: z.preprocess(
    unsetIfEmpty,
    z.coerce.number().int().min(0).max(60_000).default(0),
  ),
  // Then how long requests in flight get to finish before they are cut. Keep both together
  // under the platform's own grace period (docker stop: 10 s, Kubernetes: 30 s).
  SHUTDOWN_GRACE_MS: z.preprocess(
    unsetIfEmpty,
    z.coerce.number().int().min(0).max(600_000).default(8_000),
  ),
})

export type Env = z.infer<typeof Env>

export function parseEnv(source: Record<string, string | undefined>) {
  const nodeEnv = source.NODE_ENV
  const missing =
    nodeEnv === 'production' ? REQUIRED_IN_PRODUCTION.filter((key) => !source[key]) : []
  const parsed = Env.safeParse({
    ...source,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET || (nodeEnv === 'test' ? TEST_SECRET : undefined),
  })
  if (missing.length || !parsed.success) {
    const problems = [
      ...missing.map((key) => `✖ ${key} is required in production`),
      ...(parsed.success ? [] : [z.prettifyError(parsed.error)]),
    ]
    return { success: false as const, error: problems.join('\n') }
  }
  const data = parsed.data
  return {
    success: true as const,
    data: {
      ...data,
      LOG_LEVEL: data.LOG_LEVEL ?? (data.NODE_ENV === 'test' ? 'silent' : 'info'),
      LOG_FORMAT: data.LOG_FORMAT ?? (data.NODE_ENV === 'production' ? 'json' : 'pretty'),
      MIGRATE_ON_START: data.MIGRATE_ON_START ?? data.NODE_ENV !== 'production',
      SMTP_URL: data.SMTP_URL ?? (data.NODE_ENV === 'production' ? undefined : DEV_SMTP_URL),
    },
  }
}

const parsed = parseEnv(Bun.env)

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + parsed.error)
  process.exit(1)
}

export const env = parsed.data
