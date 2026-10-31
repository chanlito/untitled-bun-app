# Deploying the API

The API ships as one Docker image, built from the `Dockerfile` at the repo root. Any host that runs containers and gives you Postgres works: a VPS with Docker or Compose, Kubernetes, or a container platform.

## Build

```sh
docker build -t api .
```

The image runs the TypeScript source with Bun (no build step) as the unprivileged `bun` user, with `NODE_ENV=production` and only the API's production dependencies.

## Configure

Set these on the container. `.env.example` describes every variable; `src/env.ts` validates them, and the server refuses to start when one is missing or wrong.

| Variable             |                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Postgres connection URL                                                                                                                                                        |
| `API_URL`            | The API's public URL, as browsers and auth callbacks reach it                                                                                                                  |
| `APP_URL`            | The frontend's URL (CORS and auth trust this origin only)                                                                                                                      |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 32`. Keep it secret and stable: changing it signs everyone out                                                                    |
| `SMTP_URL`           | The SMTP server for sign-in emails: `smtps://user:pass@host:465` or `smtp://user:pass@host:587`. Your mail host's SMTP, or one you run yourself. `smtp://` must offer STARTTLS |
| `MAIL_FROM`          | The sender address; your SMTP server must be allowed to send as it (SPF, DKIM)                                                                                                 |
| `TRUSTED_PROXY_HOPS` | `1` behind one load balancer or platform router, otherwise every client shares one rate limit                                                                                  |
| `PORT`               | Defaults to 3141                                                                                                                                                               |

## Release

Run migrations once per release, before the new version takes traffic, from the same image (it needs only `DATABASE_URL`):

```sh
docker run --rm --env-file prod.env api bun run db:migrate
```

On a platform, that is the release or pre-deploy command (or a Kubernetes Job / init container). The server doesn't migrate by itself in production, so replicas starting together never race; until the migrations are in, `/ready` answers 503 and new instances get no traffic. A single instance can migrate on boot instead with `MIGRATE_ON_START=true`.

Write migrations that the version still running can live with (add a column, backfill, then drop the old one in a later release), since old and new instances overlap during a rolling deploy.

## Run

```sh
docker run -d --env-file prod.env -p 3141:3141 api
```

- **Liveness: `GET /health`.** 200 while the process answers. It doesn't touch the database, so an outage there doesn't get every container restarted.
- **Readiness: `GET /ready`.** 200 when the database answers within 2 s and has every migration the image ships with; 503 otherwise (the log says which), and from the moment shutdown starts. Route traffic on this one.
- **Shutdown:** on SIGTERM the server answers 503 on `/ready`, keeps serving for `SHUTDOWN_DELAY_MS` (default 0) so load balancers stop sending it traffic, stops accepting connections, lets requests in flight finish for up to `SHUTDOWN_GRACE_MS` (8 s), then closes the database pool and exits 0. Behind a load balancer that routes on `/ready` (Kubernetes, ECS, Fly), set the delay to a few seconds. Delay plus grace must stay under the platform's own kill timer (`docker stop` 10 s, Kubernetes 30 s, Fly 5 s), so lower the grace when you add a delay on a short one.

Logs are JSON lines on stdout, ready for any log shipper.

## The frontend

`apps/app` builds to static files (`bun run --filter @untitled-bun-app/app build` with `BUN_PUBLIC_API_URL` set to the API's public URL) for any static host. Set the API's `APP_URL` to wherever it is served.
