# Switching databases

The template targets Postgres. MySQL and SQLite work with the same stack (Drizzle, Better Auth, Bun's SQL client), but the switch touches every layer that knows the dialect. Plan it as a one-time port, ideally before you have data.

## What changes

| Layer                                                | Postgres (now)                               | MySQL                           | SQLite                                                   |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Schema helpers (`src/db/schema/*`)                   | `snakeCase.table` from `drizzle-orm/pg-core` | from `drizzle-orm/mysql-core`   | from `drizzle-orm/sqlite-core`                           |
| Driver (`src/db/client.ts`, `migrate.ts`, `seed.ts`) | `drizzle-orm/bun-sql/postgres`               | `drizzle-orm/bun-sql/mysql`     | `drizzle-orm/bun-sql/sqlite` or `drizzle-orm/bun-sqlite` |
| `Db` type                                            | `PgAsyncDatabase`                            | the MySQL database type         | the SQLite database type                                 |
| `drizzle.config.ts` `dialect`                        | `postgresql`                                 | `mysql`                         | `sqlite`                                                 |
| Better Auth (`src/lib/auth.ts`)                      | `provider: 'pg'`                             | `provider: 'mysql'`             | `provider: 'sqlite'`                                     |
| Tests (`src/test/db.ts`)                             | PGlite, in-process                           | a MySQL test database (compose) | `bun:sqlite` with `:memory:`                             |
| `docker-compose.yml`                                 | `postgres` service                           | uncomment `mysql` (port 3144)   | no service needed                                        |
| `DATABASE_URL`                                       | `postgres://…:3143/app`                      | `mysql://…:3144/app`            | a file path                                              |

## Column types to translate

- `timestamp({ withTimezone: true })` is Postgres-only. Use `datetime` (MySQL) or `integer({ mode: 'timestamp' })` (SQLite).
- `text().primaryKey()` IDs need a length on MySQL: `varchar({ length: 36 })`.
- `boolean()` is native on Postgres and MySQL; SQLite uses `integer({ mode: 'boolean' })`.

## Queries to revisit

- **`RETURNING`**: the services use `.returning()` on insert, update and delete. MySQL has no `RETURNING`: insert, then select by the ID the service already generated (`Bun.randomUUIDv7()`). SQLite supports it.
- Search the code for Postgres-only features before switching: `jsonb` operators, arrays, `ilike`.

## Steps

1. Port `src/db/schema/*` and the files in the driver row above.
2. Delete `apps/api/drizzle/` and run `bun run db:generate` for a fresh initial migration in the new dialect.
3. Point `DATABASE_URL` in `.env.example` and `.env.local` at the new database, and update `scripts/setup.ts`, which creates Postgres databases.
4. Rework `src/test/db.ts` for the new test database, then run `bun test` until it passes.
