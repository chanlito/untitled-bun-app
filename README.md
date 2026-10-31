# Untitled Bun App

A Bun + Hono API template: an OpenAPI spec and Scalar docs generated from typed routes, a typed RPC client, Drizzle on Postgres, and Better Auth, in a Bun workspaces monorepo.

## Start a project

1. Click **Use this template** on GitHub, then clone your new repo.
2. Run setup. The first run asks for a project name (defaulting to the folder name), optional GitHub OAuth credentials, and whether to load demo data. It renames the project, removes the template-only files and commits that as `🎉 chore: initialize from template`.

   ```sh
   bun run setup
   bun run dev
   ```

Needs [Bun canary](https://bun.com) (`bun upgrade --canary`, for `bun lint`) and Docker.

| Service | URL                             |
| ------- | ------------------------------- |
| API     | http://localhost:3141           |
| Docs    | http://localhost:3141/reference |
| App     | http://localhost:3142           |
| Mailpit | http://localhost:3145           |

With demo data, sign in as `admin@example.com` or `user@example.com`; the code arrives in Mailpit and in the API's console.

`bun run setup` is safe to run again. In a git worktree it gives that worktree its own database and ports.

## What's inside

```text
project.config.ts        # the project's name and slug
apps/
├── api/                 # Hono + @hono/zod-openapi
│   ├── drizzle/         # SQL migrations (committed)
│   └── src/
│       ├── app.ts       # createApp({ db, mailer }): auth, docs, routes
│       ├── db/          # Drizzle schema and client
│       ├── lib/         # auth, mailer, errors, router helpers
│       ├── modules/     # one folder per feature (tasks)
│       └── test/        # PGlite test database and factories
└── app/                 # plain HTML, calls the API with hc<AppType>
scripts/                 # setup and the dev guard
docker-compose.yml       # Postgres and Mailpit
```

- **API docs**: `/doc` is the OpenAPI 3.1 spec built from the route definitions; `/reference` shows it in Scalar next to the auth endpoints.
- **Auth**: Better Auth with magic links and email codes, optional GitHub login, and cookies, bearer tokens, API keys (`x-api-key`) and JWTs (JWKS at `/api/auth/jwks`). Roles `user` and `admin`.
- **Tests**: `bun test` runs against an in-process Postgres (PGlite), so nothing needs to be running.

## Scripts

| Script                | Does                                                |
| --------------------- | --------------------------------------------------- |
| `bun run setup`       | Install, env, Docker services, database, migrations |
| `bun run dev`         | API and app with hot reload                         |
| `bun test`            | All tests                                           |
| `bun run lint:check`  | `bun lint`, type-aware                              |
| `bun fmt`             | Format everything (`bun run fmt:check` only checks) |
| `bun run typecheck`   | `bun check` for each workspace                      |
| `bun run db:generate` | New migration from schema changes                   |
| `bun run db:migrate`  | Apply migrations                                    |
| `bun run db:seed`     | Demo data                                           |

Switching from Postgres to MySQL or SQLite: see [docs/switching-databases.md](docs/switching-databases.md).

## License

[MIT](LICENSE)
