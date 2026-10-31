import { existsSync, readdirSync } from 'node:fs'
import { $ } from 'bun'

export const root = new URL('..', import.meta.url).pathname
export const envLocalPath = `${root}.env.local`
export const migrationsDir = `${root}apps/api/drizzle`

export const step = (msg: string) => console.log(`✓ ${msg}`)
export const fail = (msg: string): never => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// .env files: read into a map, and set keys in place so comments and order survive
export async function readEnv(path: string) {
  const vars = new Map<string, string>()
  if (!existsSync(path)) return vars
  for (const line of (await Bun.file(path).text()).split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) vars.set(match[1]!, match[2]!)
  }
  return vars
}

export async function setEnv(path: string, values: Record<string, string>) {
  let text = existsSync(path) ? await Bun.file(path).text() : ''
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`
  }
  await Bun.write(path, text)
}

export async function isWorktree() {
  const gitDir = await $`git rev-parse --absolute-git-dir`.cwd(root).quiet().nothrow().text()
  const common = await $`git rev-parse --path-format=absolute --git-common-dir`
    .cwd(root)
    .quiet()
    .nothrow()
    .text()
  return gitDir.trim() !== '' && gitDir.trim() !== common.trim()
}

// Migration folders not yet recorded in drizzle.__drizzle_migrations
export async function pendingMigrations(databaseUrl: string) {
  const local = existsSync(migrationsDir)
    ? readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : []
  const sql = new Bun.SQL(databaseUrl)
  try {
    const [table] = (await sql`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists
    `) as { exists: boolean }[]
    if (!table?.exists) return local
    const rows = (await sql`select name from drizzle.__drizzle_migrations`) as { name: string }[]
    const applied = new Set(rows.map((r) => r.name))
    return local.filter((name) => !applied.has(name))
  } finally {
    await sql.close()
  }
}
