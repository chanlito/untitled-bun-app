// `bun run setup`: everything a fresh clone or worktree needs. Safe to run again.
//   bun run setup                    first run in a new project asks a few questions
//   bun run setup --name "My App"    same, without prompts (--yes skips the rest)
//   bun run setup --template         work on the template itself: never rename
//   bun run setup --no-seed          skip demo data on a freshly created database
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'

import { $ } from 'bun'

import { project } from '../project.config'
import {
  envLocalPath,
  fail,
  isWorktree,
  migrationStatus,
  readEnv,
  root,
  setEnv,
  step,
  worktreePaths,
} from './lib'

const { values: args } = parseArgs({
  options: {
    name: { type: 'string' },
    yes: { type: 'boolean' },
    template: { type: 'boolean' },
    'no-seed': { type: 'boolean' },
  },
})

const MIN_BUN = '1.4.4'
const worktree = await isWorktree()

// Prerequisites first, so a failure never leaves a half-done init behind
if (!Bun.semver.satisfies(Bun.version, `>=${MIN_BUN}`)) {
  fail(`Bun ${MIN_BUN}+ is required (you have ${Bun.version}). Run: bun upgrade --canary`)
}
// Probed outside the repo, so a Bun without the built-in can't fall back to a package script
if ((await $`bun lint --help`.cwd(tmpdir()).quiet().nothrow()).exitCode !== 0) {
  fail('`bun lint` is missing: it is only in Bun canary for now. Run: bun upgrade --canary')
}
if (!Bun.which('docker')) fail('Docker is required for Postgres and Mailpit')

// Phase 1: one-time init, only for a new project made from the template
let init: Awaited<ReturnType<typeof import('./template/init').runInit>> | undefined
let projectName: string = project.name

if (existsSync(`${root}scripts/template`)) {
  const template = await import('./template/init')
  if (args.template || (await template.isTemplateRepo())) {
    if (args.name) fail('This is the template repo itself: it is never renamed')
  } else if (worktree) {
    fail('Initialize the project from its main checkout first, then run setup here')
  } else {
    if ((await $`git var GIT_COMMITTER_IDENT`.cwd(root).quiet().nothrow()).exitCode !== 0) {
      fail(
        'Git needs your name and email to commit the init. Run: git config --global user.email …',
      )
    }
    init = await template.runInit({ name: args.name, yes: args.yes })
    await template.commitInit()
    projectName = init.name
  }
} else if (args.name) {
  fail(`Already initialized as "${project.name}". Renaming is a one-time step.`)
}

// Phase 2: every run
await $`bun install`.cwd(root).quiet()
step('bun install')

const freshEnv = !existsSync(envLocalPath)
if (freshEnv) {
  await Bun.write(envLocalPath, await Bun.file(`${root}.env.example`).text())
}
const env = await readEnv(envLocalPath)
const updates: Record<string, string> = {}
if (!env.get('BETTER_AUTH_SECRET')) {
  updates.BETTER_AUTH_SECRET = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    'base64url',
  )
}
if (init?.github.clientId) {
  updates.GITHUB_CLIENT_ID = init.github.clientId
  updates.GITHUB_CLIENT_SECRET = init.github.clientSecret
}
if (freshEnv && worktree) Object.assign(updates, await worktreeEnv(env))
if (Object.keys(updates).length) await setEnv(envLocalPath, updates)
step(freshEnv ? '.env.local created' : '.env.local up to date')

const vars = await readEnv(envLocalPath)
const databaseUrl = new URL(vars.get('DATABASE_URL')!)

await $`docker compose up -d --wait`.cwd(root).quiet()
step('Postgres and Mailpit running')

const created = await ensureDatabase(databaseUrl)
// Never migrated before: a brand-new database, so demo data can't duplicate anything
const status = await migrationStatus(databaseUrl.toString())
const fresh = status.total > 0 && status.pending.length === status.total
await $`bun run db:migrate`.cwd(root).quiet()
step(`Database ${databaseUrl.pathname.slice(1)} ${created ? 'created and ' : ''}migrated`)

const seed = fresh && !args['no-seed'] && (init?.demoData ?? true)
if (seed) {
  await $`bun run db:seed`.cwd(root).quiet()
  step('Demo data loaded')
}

const apiUrl = vars.get('API_URL')
console.log(`
  ${projectName}
  API        ${apiUrl}   docs: ${apiUrl}/reference
  App        ${vars.get('APP_URL')}
  Mailpit    ${vars.get('MAILPIT_URL')}${seed ? '\n  Sign in as admin@example.com or user@example.com, then open Mailpit for the code' : ''}

Next: bun run dev`)

// A worktree gets its own database and the next pair of ports that is neither in use
// nor already handed to another checkout (whose servers may simply not be running)
async function worktreeEnv(base: Map<string, string>) {
  // Folder name plus a short hash of the full path: same-named folders elsewhere stay apart
  const name = `${basename(root.replace(/\/$/, ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')}_${Bun.hash(root).toString(36).slice(0, 6)}`
  const claimed = new Set<number>()
  for (const path of await worktreePaths()) {
    const other = await readEnv(`${path}/.env.local`)
    for (const key of ['PORT', 'APP_PORT']) {
      const port = Number(other.get(key))
      if (port) claimed.add(port)
    }
  }
  const available = async (port: number) => !claimed.has(port) && (await isFree(port))
  let api = 3151
  while (!(await available(api)) || !(await available(api + 1))) api += 10
  const db = new URL(base.get('DATABASE_URL')!)
  db.pathname = `/app_${name}`
  return {
    PORT: String(api),
    API_URL: `http://localhost:${api}`,
    APP_PORT: String(api + 1),
    APP_URL: `http://localhost:${api + 1}`,
    BUN_PUBLIC_API_URL: `http://localhost:${api}`,
    DATABASE_URL: db.toString(),
  }
}

async function isFree(port: number) {
  try {
    const server = Bun.serve({ port, fetch: () => new Response() })
    await server.stop(true)
    return true
  } catch {
    return false
  }
}

async function ensureDatabase(url: URL) {
  const name = url.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(name)) fail(`Unexpected database name "${name}"`)
  const admin = new URL(url)
  admin.pathname = '/postgres'
  const sql = new Bun.SQL(admin.toString())
  try {
    // A container that just turned healthy can still refuse the first connection
    for (let attempt = 1; ; attempt++) {
      try {
        await sql`select 1`
        break
      } catch (err) {
        if (attempt === 20) throw err
        await Bun.sleep(500)
      }
    }
    const [row] = (await sql`select 1 from pg_database where datname = ${name}`) as unknown[]
    if (row) return false
    await sql.unsafe(`create database "${name}"`)
    return true
  } finally {
    await sql.close()
  }
}
