import { apiKey } from '@better-auth/api-key'
import { project } from '@project'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, emailOTP, jwt, magicLink, openAPI } from 'better-auth/plugins'
import type { Db } from '../db/client'
import * as schema from '../db/schema'
import { env } from '../env'
import type { Mailer } from './mailer'

export function createAuth({ db, mailer }: { db: Db; mailer: Mailer }) {
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
      : undefined

  return betterAuth({
    appName: project.name,
    baseURL: env.API_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    // Table names follow our convention: lowercase plurals
    user: { modelName: 'users' },
    session: { modelName: 'sessions' },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    advanced: {
      cookiePrefix: project.slug,
      database: { generateId: () => Bun.randomUUIDv7() },
    },
    socialProviders: github ? { github } : {},
    plugins: [
      magicLink({
        sendMagicLink: ({ email, url }) =>
          mailer.send({
            to: email,
            subject: `Sign in to ${project.name}`,
            text: `Sign in: ${url}`,
          }),
      }),
      emailOTP({
        sendVerificationOTP: ({ email, otp }) =>
          mailer.send({
            to: email,
            subject: `Your ${project.name} code: ${otp}`,
            text: `Your code is ${otp}`,
          }),
      }),
      bearer(),
      jwt({ schema: { jwks: { modelName: 'jwks' } } }),
      apiKey({ enableSessionForAPIKeys: true, schema: { apikey: { modelName: 'apiKeys' } } }),
      admin(),
      openAPI({ disableDefaultReference: true }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
