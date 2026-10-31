import { createRoute, z } from '@hono/zod-openapi'
import { authErrors, ErrorSchema, validationErrors } from '../../lib/errors'
import { json } from '../../lib/openapi'
import { CreateTaskSchema, TaskParamsSchema, TaskSchema, UpdateTaskSchema } from './tasks.schemas'

const base = {
  tags: ['Tasks'],
  security: [{ bearer: [] }, { apiKey: [] }] as Record<string, string[]>[],
}

const notFound = { 404: json(ErrorSchema, 'Task not found') }

export const list = createRoute({
  ...base,
  method: 'get',
  path: '/tasks',
  summary: "List the signed-in user's tasks, newest first",
  responses: { 200: json(z.array(TaskSchema), 'Tasks'), ...authErrors },
})

export const create = createRoute({
  ...base,
  method: 'post',
  path: '/tasks',
  summary: 'Create a task',
  request: { body: { content: { 'application/json': { schema: CreateTaskSchema } } } },
  responses: { 201: json(TaskSchema, 'Created'), ...authErrors, ...validationErrors },
})

export const getOne = createRoute({
  ...base,
  method: 'get',
  path: '/tasks/{id}',
  summary: 'Get a task',
  request: { params: TaskParamsSchema },
  responses: { 200: json(TaskSchema, 'The task'), ...authErrors, ...notFound },
})

export const update = createRoute({
  ...base,
  method: 'patch',
  path: '/tasks/{id}',
  summary: 'Update a task',
  request: {
    params: TaskParamsSchema,
    body: { content: { 'application/json': { schema: UpdateTaskSchema } } },
  },
  responses: {
    200: json(TaskSchema, 'Updated'),
    ...authErrors,
    ...notFound,
    ...validationErrors,
  },
})

export const remove = createRoute({
  ...base,
  method: 'delete',
  path: '/tasks/{id}',
  summary: 'Delete a task',
  request: { params: TaskParamsSchema },
  responses: { 204: { description: 'Deleted' }, ...authErrors, ...notFound },
})
