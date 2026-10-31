import pino, { type DestinationStream, type Logger } from 'pino'
import pretty from 'pino-pretty'

export type { Logger }
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'
export type LogFormat = 'json' | 'pretty'

// Pino's error serializer keeps every field of an error and its causes. Drizzle's query
// errors carry the query's params (user data) as a field and at the end of the message,
// so those are dropped; Postgres's code, constraint and table stay.
type Serialized = Record<string, unknown> & { message: string; stack: string; cause?: unknown }

function scrub(err: Serialized): Serialized {
  const { params: _params, query: _query, ...rest } = err
  const message = rest.message.split('\nparams:')[0] ?? ''
  const cause =
    rest.cause && typeof rest.cause === 'object' ? scrub(rest.cause as Serialized) : rest.cause
  return { ...rest, message, stack: rest.stack.replace(err.message, message), cause }
}

// JSON lines (pino's own format) for production log shippers; pino-pretty in development.
// `destination` is for tests. Fields are data: never log tokens, codes or query strings.
export function createLogger({
  level = 'info',
  format = 'json',
  destination,
}: {
  level?: LogLevel
  format?: LogFormat
  destination?: DestinationStream
} = {}): Logger {
  return pino(
    {
      level,
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      serializers: {
        err: (err: Error) => scrub(pino.stdSerializers.errWithCause(err) as unknown as Serialized),
      },
    },
    destination ??
      (format === 'pretty' ? pretty({ sync: true, singleLine: true }) : pino.destination(1)),
  )
}

// Tests: a real pino logger that keeps every line, parsed, so assertions can read them
export function createMemoryLogger() {
  const lines: (Record<string, unknown> & { level: string; msg: string })[] = []
  const logger = createLogger({
    level: 'debug',
    destination: {
      write: (line: string) => void lines.push(JSON.parse(line) as (typeof lines)[number]),
    },
  })
  return Object.assign(logger, { lines })
}
