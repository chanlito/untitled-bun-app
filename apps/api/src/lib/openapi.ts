import type { z } from '@hono/zod-openapi'

// Shorthand for a JSON response entry in createRoute({ responses })
export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
})
