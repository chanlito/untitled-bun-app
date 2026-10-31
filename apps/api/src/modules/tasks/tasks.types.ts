import type { tasks } from '../../db/schema'

// Derived from the table for now; write it out by hand once the two need to differ
export type Task = typeof tasks.$inferSelect

export type NewTask = { title: string }

export type TaskPatch = Partial<Pick<Task, 'title' | 'done'>>
