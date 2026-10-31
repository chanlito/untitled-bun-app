# The API as a production image: `docker build -t api .` at the repo root.
#   docker run --env-file prod.env -p 3141:3141 api               the server
#   docker run --env-file prod.env api bun run db:migrate          migrations, once per release
# Runs the TypeScript source directly (Bun needs no build step), as the unprivileged `bun` user.
# See docs/deploying.md.

# Keep in step with .bun-version (CI checks they match)
ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app
ENV NODE_ENV=production

COPY . .
# Production dependencies of the API and the workspace packages it imports, nothing else.
# --omit=peer skips optional peers such as drizzle-kit and PGlite (130 MB); peers the API
# uses are its own dependencies too, so they stay. The cache mount keeps Bun's download
# cache out of the image.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --omit=peer --filter '@untitled-bun-app/api'

USER bun
EXPOSE 3141
# For `docker run` and Compose; Kubernetes and most platforms probe /health and /ready
# themselves. Bun runs the probe: the slim image has no curl.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3141}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Bun itself as PID 1 (no shell or `bun run` in between), so SIGTERM reaches the server's
# graceful shutdown
CMD ["bun", "apps/api/src/index.ts"]
