// `bun run db:migrate`, also called by setup (the server migrates on startup too)
import { env } from '../env'
import { createDb, migrateDb } from './client'

const db = createDb(env.DATABASE_URL)
await migrateDb(db)
await db.$client.close()
console.log('Migrations applied')
