// The app's entry point, with no framework on purpose: mount React, Vue, Svelte or anything
// else here. What it shows is the wiring every frontend in the repo shares.
import { project } from '@project'
import { createClient } from '@repo/client'

// BUN_PUBLIC_* variables are inlined into the bundle by Bun, in dev and in `bun run build`
const api = createClient(process.env.BUN_PUBLIC_API_URL ?? 'http://localhost:3141')

document.title = project.name
const res = await api.health.$get().catch(() => undefined)
document.body.textContent = `${project.name}: API ${res?.ok ? 'ok' : 'unreachable'}`
