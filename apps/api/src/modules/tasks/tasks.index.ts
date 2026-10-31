import { type AuthedEnv, createRouter } from '../../lib/create-router'
import { requireUser } from '../../lib/require-user'
import * as handlers from './tasks.handlers'
import * as routes from './tasks.routes'

const router = createRouter<AuthedEnv>()

// .use() returns a plain Hono, so it stays out of the typed .openapi() chain
router.use('/tasks', requireUser)
router.use('/tasks/*', requireUser)

export const tasksRouter = router
  .openapi(routes.list, handlers.list)
  .openapi(routes.create, handlers.create)
  .openapi(routes.getOne, handlers.getOne)
  .openapi(routes.update, handlers.update)
  .openapi(routes.remove, handlers.remove)
