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

// Errors don't survive JSON.stringify, so log what's useful from them: the cause (Drizzle
// wraps the Postgres error as the cause) and Postgres's diagnostic fields. A failed
// query's params are left out, as fields and from Drizzle's message: they hold user data.
const DIAGNOSTICS = ['code', 'constraint', 'table', 'column', 'schema'] as const

function serialise(value: unknown, depth = 0): unknown {
  if (!(value instanceof Error)) return value
  const { name, stack, cause } = value
  const message = value.message.split('\nparams:')[0]
  const fields = value as unknown as Record<string, unknown>
  const diagnostics = DIAGNOSTICS.flatMap((k) =>
    typeof fields[k] === 'string' || typeof fields[k] === 'number' ? [[k, fields[k]]] : [],
  )
  return {
    name,
    message,
    stack: stack?.replace(value.message, message ?? ''),
    ...Object.fromEntries(diagnostics),
    ...(cause instanceof Error && depth < 5 ? { cause: serialise(cause, depth + 1) } : {}),
  }
}

// Never throws and always returns a string: BigInts become strings, a repeated or
// circular object becomes "[Circular]", and undefined or a function becomes its name
function stringify(value: unknown) {
  const seen = new WeakSet<object>()
  const json = JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === 'bigint') return v.toString()
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]'
      seen.add(v)
    }
    return v
  }) as string | undefined
  return json ?? String(value)
}

// JSON leaves C1 controls and the Unicode line separators as they are, but terminals act
// on some and some viewers break lines on others
const escapeControls = (s: string) =>
  s.replace(
    /[\u0080-\u009f\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )

// Pretty lines print plain values bare and quote anything else, so a value with a newline
// (a decoded request path) can't start a fake log line
const pretty = (v: unknown) =>
  typeof v === 'string' && /^[\w./:@+-]*$/.test(v) ? v : escapeControls(stringify(v))

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
        ? stringify({
            time: new Date().toISOString(),
            level: lvl,
            msg,
            ...Object.fromEntries(entries),
          })
        : [lvl.toUpperCase().padEnd(5), msg, ...entries.map(([k, v]) => `${k}=${pretty(v)}`)].join(
            ' ',
          )
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
