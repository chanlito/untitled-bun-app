import { createRoute, z } from '@hono/zod-openapi'

import { authErrors, ErrorSchema, validationErrors } from '../../lib/errors'
import { json } from '../../lib/openapi'
import { CreateTaskSchema, TaskParamsSchema, TaskSchema, UpdateTaskSchema } from './tasks.schemas'

const base = {
  tags: ['Tasks'],
  security: [{ bearer: [] }, { apiKey: [] }] as Record<string, string[]>[],
}

const notFound = {
  404: json(
    ErrorSchema,
    "No task with this id belongs to you. Another user's task looks the same.",
  ),
}

export const list = createRoute({
  ...base,
  method: 'get',
  path: '/tasks',
  operationId: 'listTasks',
  summary: 'List tasks',
  description:
    'Returns all of your tasks, newest first. There is no paging: the whole list comes back.',
  responses: { 200: json(z.array(TaskSchema), 'Your tasks, newest first.'), ...authErrors },
})

export const create = createRoute({
  ...base,
  method: 'post',
  path: '/tasks',
  operationId: 'createTask',
  summary: 'Create a task',
  description: 'Adds a task for you. It starts not done.',
  request: {
    body: { required: true, content: { 'application/json': { schema: CreateTaskSchema } } },
  },
  responses: {
    201: json(TaskSchema, 'The new task.'),
    ...authErrors,
    ...validationErrors,
  },
})

export const getOne = createRoute({
  ...base,
  method: 'get',
  path: '/tasks/{id}',
  operationId: 'getTask',
  summary: 'Get a task',
  description: 'Returns one of your tasks.',
  request: { params: TaskParamsSchema },
  responses: { 200: json(TaskSchema, 'The task.'), ...authErrors, ...notFound },
})

export const update = createRoute({
  ...base,
  method: 'patch',
  path: '/tasks/{id}',
  operationId: 'updateTask',
  summary: 'Update a task',
  description:
    'Changes the title, marks the task done or not done, or both. Fields you leave out keep their value.',
  request: {
    params: TaskParamsSchema,
    body: { required: true, content: { 'application/json': { schema: UpdateTaskSchema } } },
  },
  responses: {
    200: json(TaskSchema, 'The task after the change.'),
    ...authErrors,
    ...notFound,
    ...validationErrors,
  },
})

export const remove = createRoute({
  ...base,
  method: 'delete',
  path: '/tasks/{id}',
  operationId: 'deleteTask',
  summary: 'Delete a task',
  description: 'Deletes one of your tasks for good. There is no undo.',
  request: { params: TaskParamsSchema },
  responses: { 204: { description: 'Deleted. The body is empty.' }, ...authErrors, ...notFound },
})
