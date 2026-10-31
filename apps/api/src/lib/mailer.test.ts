import { afterEach, describe, expect, test } from 'bun:test'

import { SMTPServer } from 'smtp-server'

import { createMemoryLogger } from './logger'
import { createSmtpMailer } from './mailer'

type Received = { from: string; to: string[]; raw: string }

let server: SMTPServer | undefined
afterEach(async () => {
  const closing = server
  server = undefined
  if (closing) await new Promise<void>((done) => closing.close(() => done()))
})

// A real SMTP server on a free port, like Mailpit or a mail host; `reject` refuses every message
async function startSmtp({ reject = false } = {}) {
  const received: Received[] = []
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onData(stream, session, callback) {
      let raw = ''
      stream.on('data', (chunk: Buffer) => (raw += chunk.toString()))
      stream.on('end', () => {
        if (reject) return callback(new Error('Mailbox unavailable'))
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw,
        })
        callback()
      })
    },
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const { port } = server.server.address() as { port: number }
  return { url: `smtp://127.0.0.1:${port}`, received }
}

describe('SMTP mailer', () => {
  test('delivers over SMTP from MAIL_FROM, logging no address or body', async () => {
    const { url, received } = await startSmtp()
    const logger = createMemoryLogger()
    const mailer = createSmtpMailer({ url, from: 'no-reply@example.com', logger })
    await mailer.verify?.()
    await mailer.send({ to: 'ada@example.com', subject: 'Your code: 123456', text: 'Code 123456' })
    mailer.close?.()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ from: 'no-reply@example.com', to: ['ada@example.com'] })
    expect(received[0]!.raw).toContain('Subject: Your code: 123456')
    expect(received[0]!.raw).toContain('Code 123456')
    const logged = JSON.stringify(logger.lines)
    expect(logged).toContain('mail sent')
    expect(logged).not.toContain('ada@example.com')
    expect(logged).not.toContain('123456')
    expect(logger.lines.some((l) => l.level === 'warn')).toBe(false)
  })

  test('a refused message rejects the send', async () => {
    const { url } = await startSmtp({ reject: true })
    const mailer = createSmtpMailer({
      url,
      from: 'no-reply@example.com',
      logger: createMemoryLogger(),
    })
    await expect(mailer.send({ to: 'ada@example.com', subject: 'Hi', text: 'Hi' })).rejects.toThrow(
      'Mailbox unavailable',
    )
    mailer.close?.()
  })

  test('verify warns when the server is unreachable, without throwing', async () => {
    const logger = createMemoryLogger()
    // Port 1: nothing listens there
    const mailer = createSmtpMailer({ url: 'smtp://127.0.0.1:1', from: 'a@example.com', logger })
    await mailer.verify?.()
    mailer.close?.()
    expect(logger.lines.map((l) => l.msg)).toContain(
      'SMTP server unreachable: mail will fail until it answers',
    )
  })

  test('with requireTLS (the default off this machine), never sends without STARTTLS', async () => {
    // The server offers no STARTTLS, as when an attacker strips it from the reply
    const { url, received } = await startSmtp()
    const logger = createMemoryLogger()
    const mailer = createSmtpMailer({ url, from: 'a@example.com', logger, requireTLS: true })
    const sent = mailer.send({ to: 'ada@example.com', subject: 's', text: 't' })
    await expect(sent).rejects.toThrow(/STARTTLS/)
    mailer.close?.()
    expect(received).toHaveLength(0)
  })
})
