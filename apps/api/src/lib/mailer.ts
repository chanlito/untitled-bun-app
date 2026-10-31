export type Mail = { to: string; subject: string; text: string; html?: string }

export interface Mailer {
  send(mail: Mail): Promise<void>
}

// Development only: delivers to Mailpit and echoes to the console, sign-in codes included
// (index.ts never picks this mailer in production)
export function createMailpitMailer({ url, from }: { url: string; from: string }): Mailer {
  return {
    async send(mail) {
      console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`)
      const res = await fetch(`${url}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: from },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          Text: mail.text,
          HTML: mail.html,
        }),
      })
      if (!res.ok) console.error(`[mail] Mailpit rejected the message: ${res.status}`)
    },
  }
}

// Production placeholder: fails loudly until a real provider (e.g. Resend) is wired in
export const unconfiguredMailer: Mailer = {
  send: () => Promise.reject(new Error('No mail provider is configured for production')),
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
