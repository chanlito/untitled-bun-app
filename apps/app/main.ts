import { createClient } from '@untitled-bun-app/client'
// The app's entry point, with no framework on purpose: mount React, Vue, Svelte or anything
// else here. What it shows is the wiring every frontend in the repo shares.
import { config } from '@untitled-bun-app/config'

// BUN_PUBLIC_* variables are inlined into the bundle by Bun, in dev and in `bun run build`
const api = createClient(process.env.BUN_PUBLIC_API_URL ?? 'http://localhost:3141')

document.title = config.name
const res = await api.health.$get().catch(() => undefined)
document.body.textContent = `${config.name}: API ${res?.ok ? 'ok' : 'unreachable'}`
