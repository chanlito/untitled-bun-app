// End to end: a new project made from this template, set up exactly as the README says.
//   bun scripts/template/e2e.ts           needs Docker, Bun canary, and ports 3141-3145 free
//   bun scripts/template/e2e.ts --keep    leave the project and its containers behind
// Copies the tracked files into a fresh repo (what "Use this template" does), runs
// `bun run setup` in it, and checks that the result is renamed, committed, clean, passes
// `bun run verify`, and serves the API with demo data and working sign-in.
// Lives in scripts/template/, so projects created from the template drop it on init.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { $ } from 'bun'

import { readEnv, root } from '../lib'
import { TEMPLATE_ONLY } from './init'

const { values: args } = parseArgs({ options: { keep: { type: 'boolean' } } })

const NAME = 'Acme API'
const SLUG = 'acme-api'
const failures: string[] = []
let server: Bun.Subprocess | undefined

const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(what)
}
const run = (cmd: string[]) =>
  Bun.spawn(cmd, { cwd: dir, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
// Runs a command in the new project; on failure prints its output and stops
async function must(cmd: string[]) {
  const proc = run(cmd)
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) {
    console.error(`✗ ${cmd.join(' ')} exited with ${code}\n${out}${err}`)
    throw new Error(`${cmd.join(' ')} failed`)
  }
  return out
}
const git = (...a: string[]) => must(['git', ...a])

for (const port of [3141, 3142, 3143, 3145]) {
  if (!(await isFree(port))) {
    console.error(`✗ Port ${port} is in use. Stop the template's own services first.`)
    process.exit(1)
  }
}

const dir = mkdtempSync(join(tmpdir(), `${SLUG}-`))
// Ctrl-C would skip `finally`, leaving the API, the containers and their ports behind
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void cleanup().finally(() => process.exit(130))
  })
}

try {
  // 1. "Use this template": the tracked files in a new repo with one commit
  const files = (await $`git ls-files -z`.cwd(root).text()).split('\0').filter(Boolean)
  // The working tree, so uncommitted changes are tested too; cpSync keeps file modes
  for (const file of files) {
    if (existsSync(`${root}${file}`)) {
      cpSync(`${root}${file}`, join(dir, file), { recursive: true, verbatimSymlinks: true })
    }
  }
  await git('init', '-q', '-b', 'main')
  await git('config', 'user.name', 'E2E')
  await git('config', 'user.email', 'e2e@example.com')
  await git('add', '-A')
  await git('commit', '-q', '-m', 'Initial commit')
  await git('remote', 'add', 'origin', `https://github.com/acme/${SLUG}.git`)
  console.log(`New project in ${dir}`)

  // 2. First setup: renames, commits, installs, starts services, migrates, seeds
  const first = await must(['bun', 'run', 'setup', '--name', NAME, '--yes'])
  check(first.includes('Demo data loaded'), 'first setup loads demo data')

  const tracked = (await git('ls-files')).split('\n').filter(Boolean)
  const leftovers: string[] = []
  for (const file of tracked) {
    if (/untitled/i.test(await Bun.file(join(dir, file)).text())) leftovers.push(file)
  }
  check(
    leftovers.length === 0,
    `no trace of the template name${leftovers.length ? ` (${leftovers.join(', ')})` : ''}`,
  )
  check(
    TEMPLATE_ONLY.every((path) => !tracked.some((f) => f === path || f.startsWith(`${path}/`))),
    'template-only files are gone',
  )
  const config = await Bun.file(join(dir, 'project.config.ts')).text()
  check(config.includes(`'${NAME}'`) && config.includes(`'${SLUG}'`), 'project.config.ts renamed')
  const log = (await git('log', '--format=%s')).trim().split('\n')
  check(
    log.length === 2 && log[0] === '🎉 chore: initialize from template',
    'exactly one init commit on top of the template',
  )
  check((await git('status', '--porcelain')) === '', 'working tree clean after setup')

  // 3. Setup again: nothing to do
  const again = await must(['bun', 'run', 'setup'])
  check(
    again.includes('.env.local up to date') && !again.includes('Demo data loaded'),
    'second setup changes nothing',
  )
  check((await git('log', '--format=%s')).trim().split('\n').length === 2, 'no second commit')
  check((await git('status', '--porcelain')) === '', 'working tree still clean')

  // 4. The project's own "done" command
  await must(['bun', 'run', 'verify'])
  check(true, 'bun run verify passes')

  // 5. The API runs against the database setup made
  const env = await readEnv(join(dir, '.env.local'))
  const api = env.get('API_URL')!
  // apps/api's `start` script, run directly: through `bun run` it would be a grandchild
  // that outlives kill()
  server = Bun.spawn(['bun', '--env-file=../../.env.local', 'src/index.ts'], {
    cwd: join(dir, 'apps/api'),
    stdout: 'ignore',
    stderr: 'inherit',
  })
  check(await waitFor(`${api}/health`), 'API answers /health')
  const spec = (await (await fetch(`${api}/doc`)).json()) as { info: { title: string } }
  check(spec.info.title === NAME, `API docs are titled "${NAME}"`)

  // Sign in as the demo user with a code from Mailpit, then read the demo tasks
  const email = 'user@example.com'
  const post = (path: string, body: object) =>
    fetch(`${api}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.get('APP_URL')! },
      body: JSON.stringify(body),
    })
  const sent = await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })
  check(sent.ok, 'API sends a sign-in code')
  const otp = await waitForCode(env.get('MAILPIT_URL')!, email)
  check(Boolean(otp), 'sign-in code arrives in Mailpit')
  const signIn = await post('/sign-in/email-otp', { email, otp })
  const token = signIn.headers.get('set-auth-token')
  check(signIn.ok && Boolean(token), 'demo user signs in')
  const tasks = await fetch(`${api}/tasks`, { headers: { authorization: `Bearer ${token}` } })
  const body = JSON.stringify(await tasks.json())
  check(tasks.ok && body.includes('Demo task 10'), 'demo user sees the demo tasks')
} catch (err) {
  failures.push(String(err))
} finally {
  await cleanup()
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} failed`)
  process.exit(1)
}
console.log('\n✓ A new project from the template sets up and runs')

async function cleanup() {
  server?.kill()
  await server?.exited
  if (args.keep) {
    console.log(`Kept ${dir}`)
    return
  }
  // By the new project's name, never by its compose file: if setup stopped before the
  // rename, that file still names the template, and `down -v` would drop its database
  await $`docker compose -p ${SLUG} down -v`.cwd(dir).quiet().nothrow()
  rmSync(dir, { recursive: true, force: true })
}

// Mailpit may take a moment to show the message, so poll for it
async function waitForCode(mailpit: string, email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${mailpit}/api/v1/message/latest`).catch(() => undefined)
    if (res?.ok) {
      const mail = (await res.json()) as { Text: string; To: { Address: string }[] }
      const code = mail.To?.[0]?.Address === email ? mail.Text.match(/\d{6}/)?.[0] : undefined
      if (code) return code
    }
    await Bun.sleep(250)
  }
  return undefined
}

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(url).catch(() => undefined)
    if (res?.ok) return true
    await Bun.sleep(500)
  }
  return false
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
