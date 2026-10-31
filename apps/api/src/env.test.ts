import { describe, expect, test } from 'bun:test'

import { parseEnv } from './env'

const secret = { BETTER_AUTH_SECRET: 'x'.repeat(32) }
const urls = {
  API_URL: 'https://api.example.com',
  APP_URL: 'https://app.example.com/',
  DATABASE_URL: 'postgres://u:p@db.example.com/app',
  SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
  MAIL_FROM: 'no-reply@app.example.com',
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
      MIGRATE_ON_START: false,
    })
  })

  test('MIGRATE_ON_START is on outside production, and either way when set', () => {
    const migrates = (source: Record<string, string>) => {
      const result = parseEnv({ ...secret, ...urls, ...source })
      if (!result.success) throw new Error(result.error)
      return result.data.MIGRATE_ON_START
    }
    expect(migrates({})).toBe(true)
    expect(migrates({ MIGRATE_ON_START: '' })).toBe(true)
    expect(migrates({ MIGRATE_ON_START: 'false' })).toBe(false)
    expect(migrates({ NODE_ENV: 'production', MIGRATE_ON_START: 'true' })).toBe(true)
    expect(parseEnv({ ...secret, MIGRATE_ON_START: 'maybe' }).success).toBe(false)
  })

  test('SMTP_URL: Mailpit outside production, and only smtp:// or smtps://', () => {
    for (const value of [undefined, '']) {
      const result = parseEnv({ ...secret, SMTP_URL: value })
      if (!result.success) throw new Error(result.error)
      expect(result.data.SMTP_URL).toBe('smtp://localhost:3146')
    }
    expect(parseEnv({ ...secret, SMTP_URL: 'https://smtp.example.com' }).success).toBe(false)
  })

  test('shutdown timings: no delay and 8 s of grace by default, an empty value included', () => {
    for (const value of [undefined, '']) {
      const result = parseEnv({ ...secret, SHUTDOWN_DELAY_MS: value, SHUTDOWN_GRACE_MS: value })
      if (!result.success) throw new Error(result.error)
      expect(result.data).toMatchObject({ SHUTDOWN_DELAY_MS: 0, SHUTDOWN_GRACE_MS: 8_000 })
    }
    expect(parseEnv({ ...secret, SHUTDOWN_DELAY_MS: '60001' }).success).toBe(false)
    expect(parseEnv({ ...secret, SHUTDOWN_GRACE_MS: '600001' }).success).toBe(false)
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
