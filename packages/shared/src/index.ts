// Code that runs on both sides. The API validates requests with these rules, and a frontend
// can check a form with the very same schema before sending it. Keep it free of server-only
// imports (database, env, Node APIs), since it ends up in browser bundles.
import { z } from 'zod'

export const TASK_TITLE_MAX = 200

export const taskTitle = z.string().trim().min(1).max(TASK_TITLE_MAX)
