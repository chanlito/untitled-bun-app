// `bun run db:seed`: demo data for development. Safe to run more than once.
import { drizzle } from 'drizzle-orm/bun-sql/postgres'
import { env } from '../env'
import { tasks, users } from './schema'

const db = drizzle(env.DATABASE_URL)

const demoUsers = [
  { email: 'admin@example.com', name: 'Demo Admin', role: 'admin' },
  { email: 'user@example.com', name: 'Demo User', role: 'user' },
]

const inserted = await db
  .insert(users)
  .values(demoUsers.map((u) => ({ ...u, id: Bun.randomUUIDv7(), emailVerified: true })))
  .onConflictDoNothing({ target: users.email })
  .returning()

const demo = inserted.find((u) => u.email === 'user@example.com')
if (demo) {
  await db.insert(tasks).values(
    Array.from({ length: 10 }, (_, i) => ({
      id: Bun.randomUUIDv7(),
      userId: demo.id,
      title: `Demo task ${i + 1}`,
      done: i < 3,
    })),
  )
}

await db.$client.close()
console.log(
  inserted.length
    ? `Seeded ${inserted.length} users${demo ? ' and 10 tasks' : ''}`
    : 'Demo data already present',
)
