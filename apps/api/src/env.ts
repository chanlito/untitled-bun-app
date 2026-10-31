import { z } from 'zod'

// Development fallback only: production refuses to start with it (see below)
const DEV_SECRET = 'dev-only-secret-run-bun-run-setup-to-replace'

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3141),
    API_URL: z.url().default('http://localhost:3141'),
    APP_URL: z.url().default('http://localhost:3142'),
    DATABASE_URL: z.url().default('postgres://app:app@localhost:3143/app'),
    BETTER_AUTH_SECRET: z.string().min(32).default(DEV_SECRET),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    MAILPIT_URL: z.url().default('http://localhost:3145'),
    MAIL_FROM: z.email().default('no-reply@example.com'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.BETTER_AUTH_SECRET !== DEV_SECRET, {
    path: ['BETTER_AUTH_SECRET'],
    message: 'must be set to a real secret in production',
  })

const parsed = Env.safeParse(Bun.env)

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
