// A small structured logger: JSON lines in production (one object per line, for log
// shippers), readable lines in development. Fields are data, so never put a secret,
// a token or a full URL with its query string in them.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'
export type LogFormat = 'json' | 'pretty'
export type LogFields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

const RANK = { debug: 10, info: 20, warn: 30, error: 40, silent: Infinity } as const

// Errors don't survive JSON.stringify, so log what's useful from them
function serialise(value: unknown): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack }
  return value
}

export function createLogger({
  level = 'info',
  format = 'pretty',
  write = (line: string, isError: boolean) =>
    isError ? process.stderr.write(line + '\n') : process.stdout.write(line + '\n'),
}: {
  level?: LogLevel
  format?: LogFormat
  write?: (line: string, isError: boolean) => void
} = {}): Logger {
  const log = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields: LogFields = {}) => {
    if (RANK[lvl] < RANK[level]) return
    const entries = Object.entries(fields).map(([k, v]) => [k, serialise(v)] as const)
    const line =
      format === 'json'
        ? JSON.stringify({
            time: new Date().toISOString(),
            level: lvl,
            msg,
            ...Object.fromEntries(entries),
          })
        : [
            lvl.toUpperCase().padEnd(5),
            msg,
            ...entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`),
          ].join(' ')
    write(line, RANK[lvl] >= RANK.warn)
  }
  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
  }
}

// Tests: keep every line so assertions can read them
export function createMemoryLogger() {
  const lines: (LogFields & { level: string; msg: string })[] = []
  const at =
    (level: string) =>
    (msg: string, fields: LogFields = {}) => {
      lines.push({ ...fields, level, msg })
    }
  return {
    lines,
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
  } satisfies Logger & { lines: unknown[] }
}
