import { OpenAPIHono } from '@hono/zod-openapi'
import type { Services } from '../services'
import type { Auth } from './auth'

type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

export type AppEnv = {
  Variables: { auth: Auth; services: Services; clientIp: string }
}

// Routes behind requireUser can read the signed-in user without null checks
export type AuthedEnv = {
  Variables: AppEnv['Variables'] & { user: Session['user']; session: Session['session'] }
}

// Every router shares one validation error shape: 422 { message, issues }
export function createRouter<E extends AppEnv = AppEnv>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            message: 'Validation failed',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          422,
        )
      }
    },
  })
}
