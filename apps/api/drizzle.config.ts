import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from 'drizzle-kit'

// drizzle-kit doesn't load the root .env.local, so read this checkout's DATABASE_URL
// from it (a worktree's points at its own database)
const envLocal = join(import.meta.dirname, '../../.env.local')
const fromEnvLocal = existsSync(envLocal)
  ? readFileSync(envLocal, 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1]
  : undefined

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? fromEnvLocal ?? 'postgres://app:app@localhost:3143/app',
  },
})
