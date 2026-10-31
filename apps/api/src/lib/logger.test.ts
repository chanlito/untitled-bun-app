import { describe, expect, test } from 'bun:test'

import { createMemoryLogger } from './logger'

describe('logger', () => {
  test('writes JSON lines with an ISO time and a level name', () => {
    const logger = createMemoryLogger()
    logger.info({ requestId: 'r1' }, 'request')
    expect(logger.lines[0]).toMatchObject({ level: 'info', msg: 'request', requestId: 'r1' })
    expect(Date.parse(logger.lines[0]!.time as string)).not.toBeNaN()
  })

  test("keeps an error's cause and Postgres fields but drops a failed query's params", () => {
    const logger = createMemoryLogger()
    const pg = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'users_email_key',
    })
    const err = Object.assign(
      new Error('Failed query: insert into users\nparams: alice@example.com', { cause: pg }),
      { query: 'insert into users', params: ['alice@example.com'] },
    )
    logger.error({ err }, 'failed')
    expect(JSON.stringify(logger.lines[0])).not.toContain('alice@example.com')
    expect(logger.lines[0]).toMatchObject({
      err: {
        message: 'Failed query: insert into users',
        cause: { code: '23505', constraint: 'users_email_key' },
      },
    })
  })

  test('a BigInt or circular value never makes logging throw', () => {
    const logger = createMemoryLogger()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logger.info({ n: 1n, circular, requestId: 'r1' }, 'odd')
    expect(logger.lines[0]).toMatchObject({ msg: 'odd', requestId: 'r1' })
  })
})
