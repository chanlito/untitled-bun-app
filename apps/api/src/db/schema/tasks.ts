import { boolean, index, snakeCase, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from './auth'

export const tasks = snakeCase.table(
  'tasks',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    done: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId)],
)
