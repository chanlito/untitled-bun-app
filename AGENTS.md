# AGENTS.md

Bun + Hono API template: `apps/api` (Hono, `@hono/zod-openapi`, Drizzle 1.0 RC on Postgres, Better Auth) and `apps/app` (plain HTML calling the API through `hc<AppType>`). Scripts live in the root `package.json`.

## Getting going

- `bun run setup` then `bun run dev`. Setup is safe to repeat. In a git worktree it writes that worktree's own database and ports to `.env.local`, so read URLs from there, not from the defaults.
- Bun **canary** is required: `bun lint` is not in a stable release yet, so `bun run lint:check` fails fast on stable Bun.
- `bun test` needs nothing running: tests use an in-process PGlite copy of the migrated schema.
- To sign in by hand in dev, request a code (`POST /api/auth/email-otp/send-verification-otp`) and read it from Mailpit's `GET http://localhost:3145/api/v1/message/latest` or the API's console.
- Done means `bun run lint:check`, `bun run fmt:check`, `bun run typecheck` and `bun test` all pass; CI runs exactly these.

## Layering (apps/api)

A feature lives in `src/modules/<feature>/`: `*.schemas.ts` (Zod API shapes), `*.routes.ts` (`createRoute` contracts), `*.handlers.ts`, `*.service.ts`, `*.types.ts`, and `*.test.ts` beside them.

- Services are plain TypeScript: they take a `Db` (and a `userId` where data is per-user) and import nothing from `hono`. This keeps them callable from tests, scripts and jobs.
- Data access lives in services: of a feature's files, only `*.service.ts` and `*.types.ts` import from `drizzle-orm` or `db/`. Outside features, `db/` is imported only for wiring (`app.ts`, `services.ts`, `lib/auth.ts`) and by test helpers.
- Handlers translate HTTP: read `c.req.valid(...)`, call `c.var.services`, map domain types to the API shape (`toResponse`).
- Dependencies are explicit: `createApp({ db, mailer })` builds auth and services; new services get registered in `src/services.ts`, new routers chained in `app.ts` (the chain is `AppType`).
- Per-user queries filter on `userId` too, so another user's row is a 404.
- Services return `null` for a miss; handlers turn that into the route's 404.

## Traps we already hit

- **Drizzle 1.0**: snake_case columns come from `snakeCase.table(...)` (from `drizzle-orm/pg-core`); the old `casing` option on `drizzle()` is ignored. After a schema change, `bun run db:generate` and commit the new `apps/api/drizzle/` folder.
- **zod-openapi types**: keep shared response maps (`authErrors`, `notFound`) as plain objects, since spreading an `as const` map drops it from the route's typed responses. Give `security` an explicit `Record<string, string[]>[]` type. Register router middleware with separate `router.use(...)` calls and chain only `.openapi(...)`, because `.use()` returns a plain `Hono`.
- **Typed client**: responses are unions per status; narrow on `res.ok` or `res.status` before reading the body.
- **Better Auth**: field names in `src/db/schema/auth.ts` must match Better Auth's; its adapter looks columns up by key. A new plugin with tables needs those tables added there (list them with `getAuthTables` from `better-auth/db`).
- **Root script names**: a script named like a Bun command shadows it (`bun check` would run a `check` script), hence `typecheck`, and `lint:check` (a `lint` script would make `bun lint` on stable Bun call itself forever).

## Tests

- One app per file: `const t = await createTestApp()` in `beforeAll`, `t.close()` in `afterAll` (an open PGlite keeps the process alive).
- Each test creates its own data with `src/test/factories.ts`: `signedIn(t)` signs in through the real OTP flow and returns bearer headers; `createTask(t, userId)` inserts directly.

## Template

The project's name lives in `project.config.ts`. While `scripts/template/` exists (the template repo itself), its test fails if the template's name appears outside the files init renames; use `project.name` / `project.slug`.

## Commits

`<gitmoji> <type>(<scope>): <message>`, scope optional, e.g. `✨ feat(api): add tasks routes`, `🐛 fix: …`, `📝 docs: …`. Scopes are free-form.

## Agent skills

### Issue tracker

GitHub Issues on this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
