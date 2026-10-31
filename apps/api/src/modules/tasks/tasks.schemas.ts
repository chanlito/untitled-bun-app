import { z } from '@hono/zod-openapi'

export const TaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    done: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Task')

export const CreateTaskSchema = z
  .object({ title: z.string().trim().min(1).max(200) })
  .openapi('CreateTask')

export const UpdateTaskSchema = z
  .object({ title: z.string().trim().min(1).max(200), done: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one of title or done')
  .openapi('UpdateTask')

export const TaskParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
})
