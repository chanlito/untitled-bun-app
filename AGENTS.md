# AGENTS.md

Bun + Hono API template in a Bun workspaces monorepo. Scripts live in the root `package.json`.

- `apps/api`: Hono, `@hono/zod-openapi`, Drizzle 1.0 RC on Postgres, Better Auth.
- `apps/*`: any number of apps of any kind (web, mobile, desktop, CLI, workers). `apps/app` is a placeholder frontend, deliberately framework-free: `index.html` and one `main.ts` that calls the API. Replace it with React, Vue, Expo or anything else; keep `dev` (reads `APP_PORT`) and `build` (refuses to run without `BUN_PUBLIC_API_URL`, the API URL baked into the bundle) scripts so `bun run dev` and the e2e still work.
- `packages/config` (`@untitled-bun-app/config`): `project.config.ts`, the project's identity. Every workspace reads it as `import { config } from '@untitled-bun-app/config'` (`config.name`, `config.slug`).
- `packages/client` (`@untitled-bun-app/client`): the API's typed client, `createClient(baseUrl)`, for every frontend.
- `packages/shared` (`@untitled-bun-app/shared`): code both sides run, such as validation rules.

## Sharing code between workspaces

- A workspace imports another by its package name, declared in its own `package.json` as `"@untitled-bun-app/x": "workspace:*"` (installs are isolated, so an undeclared import fails). Packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`): no build step.
- Types from the API: frontends use `@untitled-bun-app/client`, which imports only `type AppType` from `@untitled-bun-app/api`, so no server code reaches a bundle. Never import `@untitled-bun-app/api` values from a frontend.
- Runtime code: put it in `packages/shared` only if it is safe in a browser (no `db/`, env, Node or Bun APIs). Example: `taskTitle` is the API's request rule (`tasks.schemas.ts` adds OpenAPI docs on top) and the same check a form can run.
- The scope is the project's slug: init renames `@untitled-bun-app/` in every tracked file, so name new packages under it.
- A new workspace needs a `tsconfig.json` extending `../../tsconfig.base.json` and an entry in the root `typecheck` script.

## Getting going

- `bun run setup` then `bun run dev`. Setup is safe to repeat. In a git worktree it writes that worktree's own database and ports to `.env.local`, so read URLs from there, not from the defaults.
- CI runs format, type check and tests on the Bun in `.bun-version`, and lint on canary. Locally, Bun **canary** is required: `bun lint` is not in a stable release yet (on stable Bun it fails with `Script not found "lint"`).
- `bun test` needs nothing running: tests use an in-process PGlite copy of the migrated schema.
- To sign in by hand in dev, request a code (`POST /api/auth/email-otp/send-verification-otp`) and read it from Mailpit's `GET http://localhost:3145/api/v1/message/latest` or the API's console.
- Done means `bun run verify` passes: `bun lint --max-warnings 0`, `bun fmt --check`, `bun run typecheck` and `bun test`. CI runs exactly these.

## Layering (apps/api)

A feature lives in `src/modules/<feature>/`: `*.schemas.ts` (Zod API shapes), `*.routes.ts` (`createRoute` contracts), `*.handlers.ts`, `*.service.ts`, `*.types.ts`, and `*.test.ts` beside them.

- Services are plain TypeScript: they take a `Db` (and a `userId` where data is per-user) and import nothing from `hono`. This keeps them callable from tests, scripts and jobs.
- Data access lives in services: of a feature's files, only `*.service.ts` and `*.types.ts` import from `drizzle-orm` or `db/`. Outside features, `db/` is imported only for wiring (`app.ts`, `services.ts`, `lib/auth.ts`) and by test helpers.
- Handlers translate HTTP: read `c.req.valid(...)`, call `c.var.services`, map domain types to the API shape (`toResponse`).
- Dependencies are explicit: `createApp({ db, mailer, logger })` builds auth and services; new services get registered in `src/services.ts`, new routers chained in `app.ts` (the chain is `AppType`).
- Per-user queries filter on `userId` too, so another user's row is a 404.
- Services return `null` for a miss; handlers turn that into the route's 404.

## Running in production

- Log through the injected pino `Logger` (`src/lib/logger.ts`), not `console`: `logger.info({ fields }, 'message')`. JSON lines in production, pino-pretty in development. Never log tokens, codes or query strings.
- Prefer a well-maintained library over hand-written infrastructure (pino for logs, hono-rate-limiter, ipaddr.js); write our own only for glue.
- `app.ts` sets, in order: request id, request log, secure headers, CORS, the client IP, a per-IP rate limit (hono-rate-limiter) on everything but `/health` and `/api/auth/*` (Better Auth limits those itself), a 1 MiB body limit (413) and a 30 s timeout (504).
- The client IP comes from `src/lib/client-ip.ts`: the socket address, or X-Forwarded-For only as far as `TRUSTED_PROXY_HOPS`. Better Auth gets it as `x-client-ip`; don't point it back at X-Forwarded-For.
- Production refuses to start without `API_URL`, `APP_URL` and `DATABASE_URL` (`parseEnv` in `src/env.ts`).
- `/health` is liveness (no dependencies), `/ready` is readiness: 503 until the database answers and has every migration in `apps/api/drizzle/` (`src/db/readiness.ts`). Add a dependency the API can't serve without to `/ready`, never to `/health`.
- Production doesn't migrate on boot, so replicas never race: `bun run db:migrate` runs once per release, before the new version takes traffic (it works with plain env too: the missing `.env.local` is skipped). `MIGRATE_ON_START=true` brings boot migrations back for a single instance. Write migrations the version still running can live with.
- The production image is the root `Dockerfile` (CI builds it and runs it against Postgres); `docs/deploying.md` covers release and runtime. Keep its `ARG BUN_VERSION` equal to `.bun-version`. `bun run start` runs the same server without Docker.
- On SIGTERM `index.ts` fails `/ready`, keeps serving for `SHUTDOWN_DELAY_MS`, stops listening, drains requests for `SHUTDOWN_GRACE_MS`, then closes what it opened (`createShutdown`'s `close`): close anything new you open at startup there too.

## Traps we already hit

- **Drizzle 1.0**: snake_case columns come from `snakeCase.table(...)` (from `drizzle-orm/pg-core`); the old `casing` option on `drizzle()` is ignored. After a schema change, `bun run db:generate` and commit the new `apps/api/drizzle/` folder.
- **zod-openapi types**: keep shared response maps (`authErrors`, `notFound`) as plain objects, since spreading an `as const` map drops it from the route's typed responses. Give `security` an explicit `Record<string, string[]>[]` type. Register router middleware with separate `router.use(...)` calls and chain only `.openapi(...)`, because `.use()` returns a plain `Hono`.
- **Typed client**: responses are unions per status; narrow on `res.ok` or `res.status` before reading the body.
- **Better Auth**: field names in `src/db/schema/auth.ts` must match Better Auth's; its adapter looks columns up by key. A new plugin with tables needs those tables added there (list them with `getAuthTables` from `better-auth/db`).
- **Root script names**: a script named like a Bun command shadows it (`bun check` would run a `check` script), hence `typecheck`, and no `lint` or `fmt` scripts: call the built-ins directly (a `lint` script made `bun lint` on stable Bun call itself forever).

## Tests

- One app per file: `const t = await createTestApp()` in `beforeAll`, `t.close()` in `afterAll` (an open PGlite keeps the process alive).
- Each test creates its own data with `src/test/factories.ts`: `signedIn(t)` signs in through the real OTP flow and returns bearer headers; `createTask(t, userId)` inserts directly.

## Template

The project's name lives in `packages/config/project.config.ts`. While `scripts/template/` exists (the template repo itself), its test fails if the template's name appears outside the files init renames; use `config.name` / `config.slug`.

`bun scripts/template/e2e.ts` makes a new project from the template in a temp folder, runs `bun run setup` in it, then checks the rename and init commit, a second setup changing nothing, `bun run verify`, the app build, and the API with demo data and sign-in through Mailpit. The **Template** workflow runs it in CI; run it yourself after touching setup or init (it needs Docker and ports 3141-3145 free). Init deletes `scripts/template/` and `.github/workflows/template.yml`, so nothing outside them may import from `scripts/template/`.

## README

Keep `README.md` short: what the template is, how to start a project, and pointers to where details live. Leave out anything that goes stale fast, such as versions, counts, port tables, script lists or file trees; those belong in `package.json`, this file or the code.

## Branches and commits

Branches are named `<type>/<short-name>` after the work, like `feat/csv-export` or `fix/lint-recursion`, never `claude/*`.

`<gitmoji> <type>(<scope>): <message>`, scope optional, e.g. `✨ feat(api): add tasks routes`, `🐛 fix: …`, `📝 docs: …`. Scopes are free-form.

## Pull requests

Every change goes through the **pr-writing** and **pr-risks** skills (in `.claude/skills/`) before its PR: `bun .claude/skills/pr-writing/scripts/check.ts` must end with `✓ Ready to push.`, and the PR body comes from `bun .claude/skills/pr-writing/scripts/body.ts`. **pr-proof** (screenshots) is installed but skipped for now: the app is a placeholder, so there is no `site` block in the settings yet.

- Settings live in `skills.config.ts`: the checks above, gitmoji commits, and the paths specific to this project that make a change High risk, each with a comment saying why. The skills' defaults already cover CI, Docker, env files, migrations, auth, dependencies and the skills themselves.
- Lessons are committed in `.agents/lessons/`, so cloud agents starting from a fresh clone see them.
- The skills are vendored by `npx skills add chanlito/skills` (recorded in `skills-lock.json`, which holds a content hash, not a version); update them with `npx skills update`, review the diff, and never edit them by hand. Lint and format skip them (`ignorePatterns` in `bunfig.toml`).

## Agent skills

### Issue tracker

GitHub Issues on this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
