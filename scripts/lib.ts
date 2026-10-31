import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { $ } from 'bun'

// import.meta.dir is a decoded path, so checkouts under folders with spaces work
export const root = `${resolve(import.meta.dir, '..')}/`
export const envLocalPath = `${root}.env.local`
export const migrationsDir = `${root}apps/api/drizzle`

// The one-time init (scripts/template/init.ts) deletes itself, so setup loads it by path
// and types it with these. init.ts checks that it still matches TemplateInit.
export const templateInitPath = `${root}scripts/template/init.ts`
export type InitAnswers = {
  name: string
  github: { clientId: string; clientSecret: string }
  demoData: boolean
}
export type TemplateInit = {
  isTemplateRepo(): Promise<boolean>
  runInit(options: { name?: string; yes?: boolean }): Promise<InitAnswers>
  commitInit(): Promise<void>
}

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
    // Matching quotes around a value are dotenv syntax, not part of it
    if (match) vars.set(match[1]!, match[2]!.replace(/^(['"])(.*)\1$/, '$2'))
  }
  return vars
}

export async function setEnv(path: string, values: Record<string, string>) {
  let text = existsSync(path) ? await Bun.file(path).text() : ''
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    // A replacer function, so `$` in a value is copied literally
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`
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

// Every checkout of this repo (main + worktrees), for spotting ports already handed out
export async function worktreePaths() {
  const out = await $`git worktree list --porcelain`.cwd(root).quiet().nothrow().text()
  return out
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
}

// Migration folders, and which of them drizzle.__drizzle_migrations hasn't recorded
export async function migrationStatus(databaseUrl: string) {
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
    if (!table?.exists) return { total: local.length, pending: local }
    const rows = (await sql`select name from drizzle.__drizzle_migrations`) as { name: string }[]
    const applied = new Set(rows.map((r) => r.name))
    return { total: local.length, pending: local.filter((name) => !applied.has(name)) }
  } finally {
    await sql.close()
  }
}
