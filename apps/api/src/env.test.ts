import { describe, expect, test } from 'bun:test'

import { parseEnv } from './env'

const secret = { BETTER_AUTH_SECRET: 'x'.repeat(32) }
const urls = {
  API_URL: 'https://api.example.com',
  APP_URL: 'https://app.example.com/',
  DATABASE_URL: 'postgres://u:p@db.example.com/app',
}

describe('parseEnv', () => {
  test('production refuses to fall back to the localhost URLs', () => {
    const result = parseEnv({ NODE_ENV: 'production', ...secret })
    expect(result.success).toBe(false)
    if (result.success) return
    for (const key of Object.keys(urls)) expect(result.error).toContain(`${key} is required`)
  })

  test('production with its URLs logs JSON at info', () => {
    const result = parseEnv({ NODE_ENV: 'production', ...secret, ...urls })
    if (!result.success) throw new Error(result.error)
    expect(result.data).toMatchObject({
      APP_URL: 'https://app.example.com',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      TRUSTED_PROXY_HOPS: 0,
    })
  })

  test('development keeps its defaults and readable logs', () => {
    const result = parseEnv({ ...secret })
    if (!result.success) throw new Error(result.error)
    expect(result.data).toMatchObject({
      API_URL: 'http://localhost:3141',
      LOG_FORMAT: 'pretty',
      RATE_LIMIT_PER_MINUTE: 300,
    })
  })

  test('tests get a secret and silent logs', () => {
    const result = parseEnv({ NODE_ENV: 'test' })
    if (!result.success) throw new Error(result.error)
    expect(result.data.LOG_LEVEL).toBe('silent')
  })

  test('the auth secret is required outside tests', () => {
    expect(parseEnv({ NODE_ENV: 'development' }).success).toBe(false)
  })
})
