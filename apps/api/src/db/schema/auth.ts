// Tables Better Auth needs for the plugins in lib/auth.ts (core + admin + jwt + api-key).
// Keep field names identical to Better Auth's: its adapter looks columns up by these keys.
import { boolean, index, integer, snakeCase, text, timestamp } from 'drizzle-orm/pg-core'

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

export const users = snakeCase.table('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text(),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = snakeCase.table(
  'sessions',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    impersonatedBy: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
)

export const accounts = snakeCase.table(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
)

export const verifications = snakeCase.table(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.identifier)],
)

export const jwks = snakeCase.table('jwks', {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  alg: text(),
  crv: text(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  expiresAt: timestamp({ withTimezone: true }),
})

export const apiKeys = snakeCase.table(
  'api_keys',
  {
    id: text().primaryKey(),
    configId: text().notNull().default('default'),
    name: text(),
    start: text(),
    prefix: text(),
    key: text().notNull(),
    referenceId: text().notNull(),
    refillInterval: integer(),
    refillAmount: integer(),
    lastRefillAt: timestamp({ withTimezone: true }),
    enabled: boolean().default(true),
    rateLimitEnabled: boolean().default(true),
    rateLimitTimeWindow: integer().default(86_400_000),
    rateLimitMax: integer().default(10),
    requestCount: integer().default(0),
    remaining: integer(),
    lastRequest: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    permissions: text(),
    metadata: text(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.configId), index().on(t.referenceId), index().on(t.key)],
)
