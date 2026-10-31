import { z } from 'zod'

const NODE_ENV = z.enum(['development', 'test', 'production']).default('development')

// Only `bun test` gets a built-in secret. Everywhere else it must be set
// (setup generates one into .env.local), so a deploy that forgets it fails to start.
const TEST_SECRET = 'test-only-secret-never-used-outside-bun-test'

const Env = z.object({
  NODE_ENV,
  PORT: z.coerce.number().int().positive().default(3141),
  API_URL: z.url().default('http://localhost:3141'),
  APP_URL: z.url().default('http://localhost:3142'),
  DATABASE_URL: z.url().default('postgres://app:app@localhost:3143/app'),
  BETTER_AUTH_SECRET: z.string().min(32),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  MAILPIT_URL: z.url().default('http://localhost:3145'),
  MAIL_FROM: z.email().default('no-reply@example.com'),
})

const isTest = NODE_ENV.parse(Bun.env.NODE_ENV) === 'test'
const parsed = Env.safeParse({
  ...Bun.env,
  BETTER_AUTH_SECRET: Bun.env.BETTER_AUTH_SECRET || (isTest ? TEST_SECRET : undefined),
})

if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
