import { createApp } from './app'
import { env } from './env'

const app = createApp()

const server = Bun.serve({ port: env.PORT, fetch: app.fetch })

console.log(`API on ${server.url} (docs: ${server.url}reference)`)
