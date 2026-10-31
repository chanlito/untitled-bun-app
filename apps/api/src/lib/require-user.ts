import { createMiddleware } from 'hono/factory'
import type { AppEnv, AuthedEnv } from './create-router'

// Resolves the user from a session cookie, a bearer token or an x-api-key header
export const requireUser = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
  if (!result) return c.json({ message: 'Unauthorized' }, 401)
  c.set('user', result.user)
  c.set('session', result.session)
  await next()
})
