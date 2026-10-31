import { z } from '@hono/zod-openapi'

import { json } from './openapi'

export const ErrorSchema = z
  .object({
    message: z.string().openapi({
      description: 'What went wrong, for a developer to read.',
      example: 'Unauthorized',
    }),
  })
  .openapi('Error', { description: 'Every error response has this shape.' })

export const ValidationErrorSchema = ErrorSchema.extend({
  message: z.string().openapi({ example: 'Validation failed' }),
  issues: z
    .array(
      z.object({
        path: z.string().openapi({
          description: 'The field that failed, dot-separated for nested fields.',
          example: 'title',
        }),
        message: z.string().openapi({
          description: 'Why it failed.',
          example: 'Too small: expected string to have >=1 characters',
        }),
      }),
    )
    .openapi({ description: 'One entry per problem.' }),
}).openapi('ValidationError', { description: 'A request that failed validation.' })

// Responses every authenticated route can return
export const authErrors = {
  401: json(ErrorSchema, 'No credential was sent, or it is expired, revoked or wrong.'),
  429: json(
    ErrorSchema,
    'Too many requests from this IP address or API key. Retry after the seconds in `RateLimit-Reset`.',
  ),
}

export const validationErrors = {
  422: json(ValidationErrorSchema, 'The request failed validation. `issues` says which fields.'),
}
