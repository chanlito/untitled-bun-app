import { OpenAPIHono } from '@hono/zod-openapi'

export type AppEnv = {
  Variables: Record<string, never>
}

// Every router shares one validation error shape: 422 { message, issues }
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
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
