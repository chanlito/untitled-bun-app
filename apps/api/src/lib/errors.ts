import { z } from '@hono/zod-openapi'

export const ErrorSchema = z.object({ message: z.string() }).openapi('Error')

export const ValidationErrorSchema = ErrorSchema.extend({
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
}).openapi('ValidationError')
