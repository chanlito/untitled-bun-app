import { z } from '@hono/zod-openapi'
import { taskTitle } from '@repo/shared'

const id = z.string().openapi({
  description: "The task's id. Opaque: compare it, don't parse it.",
  example: '019a3a5e-7c1f-7b4e-9d2a-5f0c1e8b3a47',
})

// The rules come from @repo/shared, so a frontend can check a form the same way
const title = taskTitle.openapi({
  description: 'What needs doing. Surrounding whitespace is trimmed; 1 to 200 characters remain.',
  example: 'Renew the domain',
})

export const TaskSchema = z
  .object({
    id,
    title: z.string().openapi({ description: 'What needs doing.', example: 'Renew the domain' }),
    done: z.boolean().openapi({ description: 'Whether the task is finished.', example: false }),
    createdAt: z.iso.datetime().openapi({
      description: 'When the task was created, in UTC.',
      example: '2026-10-31T15:04:05.000Z',
    }),
  })
  .openapi('Task', { description: 'A to-do item owned by one user.' })

export const CreateTaskSchema = z
  .object({ title })
  .openapi('CreateTask', { description: 'A new task. It starts with `done: false`.' })

export const UpdateTaskSchema = z
  .object({
    title,
    done: z.boolean().openapi({ description: 'Mark the task finished or not.', example: true }),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one of title or done')
  .openapi('UpdateTask', {
    description: 'The fields to change. Send at least one; fields you leave out keep their value.',
  })

export const TaskParamsSchema = z.object({
  id: id.openapi({ param: { name: 'id', in: 'path' } }),
})
