import type { AppType } from '@repo/api'
import { hc } from 'hono/client'

// BUN_PUBLIC_* variables are inlined into the bundle by Bun
const baseUrl = process.env.BUN_PUBLIC_API_URL ?? 'http://localhost:3141'

export const api = hc<AppType>(baseUrl, { init: { credentials: 'include' } })
