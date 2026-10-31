// Runs before `bun run dev`: fail fast with one line telling you what to do
import { existsSync } from 'node:fs'

import { envLocalPath, fail, migrationStatus, readEnv } from './lib'

if (!existsSync(envLocalPath)) fail("Setup hasn't been run in this checkout. Run: bun run setup")

const vars = await readEnv(envLocalPath)
const databaseUrl = vars.get('DATABASE_URL')
if (!databaseUrl) fail('DATABASE_URL is missing from .env.local. Run: bun run setup')

const { pending } = await migrationStatus(databaseUrl!).catch(() =>
  fail("Can't reach the database. Run: bun run setup"),
)
if (pending.length) fail(`Migrations are behind (${pending.length} pending). Run: bun run setup`)

// Mail goes to Mailpit over SMTP: a container started before its SMTP port was published
// would refuse every sign-in email. Only a server on this machine is checked.
const smtp = URL.parse(vars.get('SMTP_URL') || 'smtp://localhost:3146')
if (!smtp) fail('SMTP_URL in .env.local is not a URL. Run: bun run setup')
if (['localhost', '127.0.0.1', '[::1]'].includes(smtp!.hostname.toLowerCase())) {
  const socket = await Bun.connect({
    hostname: smtp!.hostname.replace(/^\[|\]$/g, ''),
    port: Number(smtp!.port || (smtp!.protocol === 'smtps:' ? 465 : 25)),
    socket: { data() {} },
  }).catch(() => fail("Can't reach Mailpit's SMTP port. Run: bun run setup"))
  socket.end()
}
