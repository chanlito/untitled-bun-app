import nodemailer from 'nodemailer'

import type { Logger } from './logger'

export type Mail = { to: string; subject: string; text: string; html?: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
  // Checks the connection once at startup, so a wrong SMTP_URL shows in the log right away
  verify?(): Promise<void>
  // Closes open connections on shutdown
  close?(): void
}

// Any SMTP server: Mailpit in development (docker-compose.yml), and in production your mail
// host's SMTP or one you run yourself. `url` is a connection URL, credentials included:
// smtp://user:pass@host:587 (STARTTLS when offered), smtps://user:pass@host:465 (TLS).
// Connections are pooled. A failed send rejects, so the request that sent it fails loudly.
export function createSmtpMailer({
  url,
  from,
  logger,
}: {
  url: string
  from: string
  logger: Logger
}): Mailer {
  const transport = nodemailer.createTransport(withPool(url))
  return {
    async send(mail) {
      // Not the address or the body: they hold personal data and sign-in codes
      const info = await transport.sendMail({ from, ...mail })
      logger.debug({ messageId: info.messageId }, 'mail sent')
    },
    async verify() {
      try {
        await transport.verify()
      } catch (err) {
        logger.warn({ err }, 'SMTP server unreachable: mail will fail until it answers')
      }
    },
    close: () => transport.close(),
  }
}

// nodemailer reads options from the URL's query: pooling unless the URL says otherwise
function withPool(url: string) {
  const parsed = new URL(url)
  if (!parsed.searchParams.has('pool')) parsed.searchParams.set('pool', 'true')
  return parsed.toString()
}

// Production without SMTP_URL: fails loudly instead of pretending to send
export const unconfiguredMailer: Mailer = {
  send: () => Promise.reject(new Error('No mail server is configured: set SMTP_URL')),
}

// Tests: keep every message so assertions can read codes and links
export function createMemoryMailer() {
  const sent: Mail[] = []
  return {
    sent,
    send(mail: Mail) {
      sent.push(mail)
      return Promise.resolve()
    },
  } satisfies Mailer & { sent: Mail[] }
}
