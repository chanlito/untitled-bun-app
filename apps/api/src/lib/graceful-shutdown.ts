import type { Logger } from './logger'

type Server = { stop(closeActiveConnections?: boolean): Promise<void> }

// Stops the server the way an orchestrator expects on SIGTERM: abort `controller` (so /ready
// answers 503), stop accepting connections, let requests in flight finish for up to `graceMs`,
// cut whatever is left, then run `close` (database pool, mail transport). Calling it again
// returns the same promise, so a second signal doesn't start a second shutdown.
export function createShutdown({
  server,
  controller,
  logger,
  graceMs,
  close = () => Promise.resolve(),
}: {
  server: Server
  controller: AbortController
  logger: Logger
  graceMs: number
  close?: () => Promise<unknown>
}) {
  let done: Promise<void> | undefined
  return (reason: string) =>
    (done ??= (async () => {
      logger.info({ reason }, 'shutting down')
      controller.abort()
      const force = setTimeout(() => {
        logger.warn({ graceMs }, 'requests still running after the grace period; closing them')
        void server.stop(true)
      }, graceMs)
      await server.stop()
      clearTimeout(force)
      await close()
      logger.info('stopped')
    })())
}
