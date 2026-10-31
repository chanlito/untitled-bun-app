import type { RouteConfig, RouteHandler } from '@hono/zod-openapi'

import type { AuthedEnv } from '../../lib/create-router'
import type * as routes from './tasks.routes'
import type { Task } from './tasks.types'

type Handler<R extends RouteConfig> = RouteHandler<R, AuthedEnv>

// Domain type → API shape: userId stays internal, dates become ISO strings
const toResponse = (t: Task) => ({
  id: t.id,
  title: t.title,
  done: t.done,
  createdAt: t.createdAt.toISOString(),
})

const notFound = { message: 'Task not found' }

export const list: Handler<typeof routes.list> = async (c) => {
  const tasks = await c.var.services.tasks.list(c.var.user.id)
  return c.json(tasks.map(toResponse), 200)
}

export const create: Handler<typeof routes.create> = async (c) => {
  const task = await c.var.services.tasks.create(c.var.user.id, c.req.valid('json'))
  return c.json(toResponse(task), 201)
}

export const getOne: Handler<typeof routes.getOne> = async (c) => {
  const task = await c.var.services.tasks.get(c.var.user.id, c.req.valid('param').id)
  return task ? c.json(toResponse(task), 200) : c.json(notFound, 404)
}

export const update: Handler<typeof routes.update> = async (c) => {
  const { id } = c.req.valid('param')
  const task = await c.var.services.tasks.update(c.var.user.id, id, c.req.valid('json'))
  return task ? c.json(toResponse(task), 200) : c.json(notFound, 404)
}

export const remove: Handler<typeof routes.remove> = async (c) => {
  const removed = await c.var.services.tasks.remove(c.var.user.id, c.req.valid('param').id)
  return removed ? c.body(null, 204) : c.json(notFound, 404)
}
