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
