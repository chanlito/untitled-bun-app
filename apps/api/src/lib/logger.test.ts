import { describe, expect, test } from 'bun:test'
import { createLogger } from './logger'

const capture = (options: Parameters<typeof createLogger>[0]) => {
  const out: { line: string; isError: boolean }[] = []
  const logger = createLogger({ ...options, write: (line, isError) => out.push({ line, isError }) })
  return { logger, out }
}

describe('logger', () => {
  test('json writes one object per line, errors to stderr', () => {
    const { logger, out } = capture({ format: 'json' })
    logger.error('failed', { requestId: 'r1', err: new Error('boom') })
    const entry = JSON.parse(out[0]!.line) as Record<string, unknown>
    expect(entry).toMatchObject({ level: 'error', msg: 'failed', requestId: 'r1' })
    expect(entry.err).toMatchObject({ name: 'Error', message: 'boom' })
    expect(out[0]!.isError).toBe(true)
  })

  test("keeps an error's cause, which holds the driver's detail", () => {
    const { logger, out } = capture({ format: 'json' })
    const pg = Object.assign(new Error('duplicate key'), { code: '23505' })
    logger.error('failed', { err: new Error('Failed query', { cause: pg }) })
    const entry = JSON.parse(out[0]!.line) as { err: { cause: Record<string, unknown> } }
    expect(entry.err.cause).toMatchObject({ message: 'duplicate key', code: '23505' })
  })

  test('pretty quotes values that could break the line', () => {
    const { logger, out } = capture({})
    logger.info('request', { path: '/x\nERROR forged', status: 404 })
    expect(out[0]!.line).toBe('INFO  request path="/x\\nERROR forged" status=404')
  })

  test('a BigInt or circular value never makes logging throw', () => {
    const { logger, out } = capture({ format: 'json' })
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logger.error('odd', { n: 1n })
    logger.error('odder', { circular })
    expect(JSON.parse(out[0]!.line)).toMatchObject({ n: '1' })
    expect(out).toHaveLength(2)
  })

  test('pretty escapes Unicode line separators', () => {
    const { logger, out } = capture({})
    logger.info('request', { path: '/x\u2028ERROR forged' })
    expect(out[0]!.line).not.toContain('\u2028')
  })

  test('drops lines below its level', () => {
    const { logger, out } = capture({ level: 'warn' })
    logger.info('quiet')
    logger.warn('loud')
    expect(out.map((o) => o.line)).toEqual(['WARN  loud'])
  })

  test('silent writes nothing', () => {
    const { logger, out } = capture({ level: 'silent' })
    logger.error('nope')
    expect(out).toEqual([])
  })
})
