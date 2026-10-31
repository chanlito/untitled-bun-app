# Untitled Bun App

A Bun + Hono API template: typed routes that generate an OpenAPI spec and docs, a typed RPC client, Drizzle on Postgres, and Better Auth. The frontend in `apps/app` is a framework-free placeholder: swap in React, Vue, Expo or whatever you like, and add as many other apps beside it as you need (web, mobile, desktop, CLI, workers), all sharing code through `packages/`.

## Start a project

Needs [Bun canary](https://bun.com) (`bun upgrade --canary`) and Docker.

1. Click **Use this template** on GitHub, then clone your new repo.
2. Run setup, then start the dev servers:

   ```sh
   bun run setup
   bun run dev
   ```

The first setup asks for a project name, renames the project and commits the result. It ends by printing the URLs to open. Running it again is safe.

## Where to look next

- [AGENTS.md](AGENTS.md): how the code is organized, conventions, and what "done" means (`bun run verify`).
- [package.json](package.json): the scripts.
- `/reference` on the running API: the API reference.
- [docs/](docs/): guides such as switching databases.

## License

[MIT](LICENSE)
