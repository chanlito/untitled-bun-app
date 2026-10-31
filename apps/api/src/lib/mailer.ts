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
// smtps://user:pass@host:465 (TLS from the start) or smtp://user:pass@host:587 (STARTTLS,
// required so credentials and codes never cross the network in the clear; only a server on
// this machine, like Mailpit, may skip it, and `?requireTLS=false` in the URL opts out).
// Connections are pooled. A failed send rejects, so the request that sent it fails loudly.
export function createSmtpMailer({
  url,
  from,
  logger,
  requireTLS = requiresTls(url),
}: {
  url: string
  from: string
  logger: Logger
  requireTLS?: boolean
}): Mailer {
  // Settings in the URL's query win over these
  const transport = nodemailer.createTransport({ url, pool: true, requireTLS })
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

// STARTTLS is required unless the server is on this machine (Mailpit in development)
export const requiresTls = (url: string) =>
  !new Set(['localhost', '127.0.0.1', '[::1]']).has(new URL(url).hostname.toLowerCase())

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
