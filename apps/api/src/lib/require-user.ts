import { isAPIError } from 'better-auth/api'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { createMiddleware } from 'hono/factory'
import type { AppEnv, AuthedEnv } from './create-router'

// Resolves the user from a session cookie, a bearer token or an x-api-key header
export const requireUser = createMiddleware<AppEnv & AuthedEnv>(async (c, next) => {
  let result
  try {
    result = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
  } catch (err) {
    // Better Auth throws for a bad (403) or rate-limited (429) API key. A credential that
    // doesn't check out is "not signed in" to our routes, so only 429 keeps its status.
    if (isAPIError(err)) {
      const status: ContentfulStatusCode = err.statusCode === 429 ? 429 : 401
      return c.json({ message: err.message || 'Unauthorized' }, status)
    }
    throw err
  }
  if (!result) return c.json({ message: 'Unauthorized' }, 401)
  c.set('user', result.user)
  c.set('session', result.session)
  await next()
})
