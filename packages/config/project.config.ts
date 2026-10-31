// The project's identity: the same on every machine and in every deployment.
// Ports, URLs and secrets differ per environment, so they live in env instead.
export const config = {
  name: 'Untitled Bun App',
  slug: 'untitled-bun-app',
  description: 'A Bun + Hono API template',
} as const
