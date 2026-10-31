# Untitled Bun App

A Bun + Hono API template: OpenAPI spec, Scalar docs, and a typed RPC client, in a Bun workspaces monorepo.

> Work in progress. Setup, auth and the database layer are still being built.

## Run it

Needs Bun canary (`bun upgrade --canary`, for `bun lint`) and Docker.

```sh
bun install
cp .env.example .env.local
docker compose up -d
bun run dev
```

| Service | URL                             |
| ------- | ------------------------------- |
| API     | http://localhost:3141           |
| Docs    | http://localhost:3141/reference |
| App     | http://localhost:3142           |
| Mailpit | http://localhost:3145           |

## Checks

```sh
bun run lint && bun run fmt:check && bun run check && bun test
```
