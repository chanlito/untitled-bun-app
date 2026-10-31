// Runs before `bun run dev`: fail fast with one line telling you what to do
import { existsSync } from 'node:fs'
import { envLocalPath, fail, pendingMigrations, readEnv } from './lib'

if (!existsSync(envLocalPath)) fail("Setup hasn't been run in this checkout. Run: bun run setup")

const databaseUrl = (await readEnv(envLocalPath)).get('DATABASE_URL')
if (!databaseUrl) fail('DATABASE_URL is missing from .env.local. Run: bun run setup')

const pending = await pendingMigrations(databaseUrl!).catch(() =>
  fail("Can't reach the database. Run: bun run setup"),
)
if (pending.length) fail(`Migrations are behind (${pending.length} pending). Run: bun run setup`)
