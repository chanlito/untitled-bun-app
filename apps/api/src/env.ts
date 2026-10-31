import { z } from 'zod'

const NODE_ENV = z.enum(['development', 'test', 'production']).default('development')

// Only `bun test` gets a built-in secret. Everywhere else it must be set
// (setup generates one into .env.local), so a deploy that forgets it fails to start.
const TEST_SECRET = 'test-only-secret-never-used-outside-bun-test'

// The localhost defaults suit development only: production must name them, so a
// deploy that forgets one fails to start instead of pointing at localhost
const REQUIRED_IN_PRODUCTION = ['API_URL', 'APP_URL', 'DATABASE_URL'] as const

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
  // Development mail catcher; when unset, sending mail fails until a provider is wired in
  MAILPIT_URL: z.url().optional(),
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
    },
  }
}

const parsed = parseEnv(Bun.env)

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + parsed.error)
  process.exit(1)
}

export const env = parsed.data
