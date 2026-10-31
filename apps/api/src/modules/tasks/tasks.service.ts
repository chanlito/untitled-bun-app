import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { tasks } from '../../db/schema'
import type { NewTask, Task, TaskPatch } from './tasks.types'

// Every query is scoped to the owner, so another user's task is simply not found
export function createTasksService(db: Db) {
  const owned = (userId: string, id: string) => and(eq(tasks.id, id), eq(tasks.userId, userId))

  return {
    list(userId: string): Promise<Task[]> {
      return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.id))
    },

    async get(userId: string, id: string): Promise<Task | null> {
      const [task] = await db.select().from(tasks).where(owned(userId, id)).limit(1)
      return task ?? null
    },

    async create(userId: string, input: NewTask): Promise<Task> {
      const [task] = await db
        .insert(tasks)
        .values({ id: Bun.randomUUIDv7(), userId, ...input })
        .returning()
      return task!
    },

    async update(userId: string, id: string, patch: TaskPatch): Promise<Task | null> {
      const [task] = await db.update(tasks).set(patch).where(owned(userId, id)).returning()
      return task ?? null
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const deleted = await db.delete(tasks).where(owned(userId, id)).returning({ id: tasks.id })
      return deleted.length > 0
    },
  }
}
