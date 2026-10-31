import { z } from '@hono/zod-openapi'

import { json } from './openapi'

export const ErrorSchema = z.object({ message: z.string() }).openapi('Error')

export const ValidationErrorSchema = ErrorSchema.extend({
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
}).openapi('ValidationError')

// Responses every authenticated route can return
export const authErrors = {
  401: json(ErrorSchema, 'Not signed in, or the credential is invalid'),
  429: json(ErrorSchema, 'API key rate limit exceeded'),
}

export const validationErrors = {
  422: json(ValidationErrorSchema, 'Invalid input'),
}
