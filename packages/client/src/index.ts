// The API's typed client, for any frontend in the repo (web, mobile, scripts). Paths, inputs
// and responses come from the API's route definitions, so an API change that breaks a caller
// fails type checking there. Only the API's types are imported: none of its code ships.
import type { AppType } from '@untitled-bun-app/api'
import { type ClientRequestOptions, hc } from 'hono/client'

// Computed once here, so editors don't re-derive the whole route tree in every file
export type Client = ReturnType<typeof hc<AppType>>

// Cookies by default, for a browser app on another origin; pass `headers` with a bearer
// token or API key where cookies don't apply, such as React Native
export const createClient = (baseUrl: string, options?: ClientRequestOptions): Client =>
  hc<AppType>(baseUrl, { ...options, init: { credentials: 'include', ...options?.init } })
