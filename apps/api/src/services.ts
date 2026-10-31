import type { Db } from './db/client'
import { createTasksService } from './modules/tasks/tasks.service'

export const createServices = (db: Db) => ({
  tasks: createTasksService(db),
})

export type Services = ReturnType<typeof createServices>
