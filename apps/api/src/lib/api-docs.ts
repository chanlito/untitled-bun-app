import { project } from '@untitled-bun-app/config'

type IntroOptions = {
  apiUrl: string
  maxBodyBytes: number
  timeoutMs: number
  rateLimitPerMinute: number
}

// The reference's front page (Markdown), written for whoever calls the API: our own apps or
// someone else's. Numbers come from the running config so the page never drifts from it.
export function apiIntro({ apiUrl, maxBodyBytes, timeoutMs, rateLimitPerMinute }: IntroOptions) {
  const limit =
    rateLimitPerMinute > 0
      ? `Each client IP address can make **${rateLimitPerMinute} requests a minute** to the endpoints in this reference.`
      : 'This deployment has no per-IP request limit.'

  return `How to call the ${project.name} API: getting a credential, the shape of errors, the limits, and the conventions every endpoint shares. The endpoints themselves are listed after this page.

Request and response bodies are JSON (\`content-type: application/json\`). An endpoint that needs a credential acts as the user behind it.

## Base URL

\`\`\`text
${apiUrl}
\`\`\`

## Authentication

Most endpoints need one of these credentials, and each endpoint lists the ones it accepts. Without a valid one you get \`401\`.

### Session token (apps acting for a person)

Sign the person in with a one-time code sent to their email, then send the token you get back as a bearer token.

1. Ask for a code: \`POST /api/auth/email-otp/send-verification-otp\` with \`{ "email": "ada@example.com", "type": "sign-in" }\`. The person receives a 6-digit code by email.
2. Exchange it: \`POST /api/auth/sign-in/email-otp\` with \`{ "email": "ada@example.com", "otp": "123456" }\`. The session token is in the response's \`set-auth-token\` header.
3. Send it on every request:

\`\`\`http
Authorization: Bearer <session token>
\`\`\`

The session expires after 7 days without use. \`POST /api/auth/sign-out\` ends it early.

### API key (servers and scripts)

A signed-in user creates a key with \`POST /api/auth/api-key/create\` and \`{ "name": "nightly sync" }\`. The response's \`key\` is shown only once, so store it then. Send it as:

\`\`\`http
x-api-key: <API key>
\`\`\`

A key acts as the user who created it and sees exactly what they see. Each key can make 600 requests a minute, on top of the per-IP limit below. List and revoke keys with \`GET /api/auth/api-key/list\` and \`POST /api/auth/api-key/delete\`.

### Browser apps on our own domain

Our web app signs in with a session cookie instead. Cross-origin cookies are accepted only from our own app, so other browser apps should use a session token.

Every sign-in and key endpoint is documented in the **Auth** reference: pick it from the menu at the top left.

## Errors

Every error has the same shape. Show \`message\` to a developer, not to an end user:

\`\`\`json
{ "message": "Unauthorized" }
\`\`\`

A \`422\` also lists what was wrong with the input, one entry per field:

\`\`\`json
{
  "message": "Validation failed",
  "issues": [
    {
      "path": "title",
      "message": "Too small: expected string to have >=1 characters"
    }
  ]
}
\`\`\`

- **\`401\`** No credential, or it is expired, revoked or wrong. Sign in again or use another key.
- **\`404\`** Not found, or it belongs to another user. Check the id.
- **\`413\`** The body is larger than ${maxBodyBytes / 1024 / 1024} MB. Send less.
- **\`422\`** The body or parameters failed validation. Fix the fields in \`issues\`.
- **\`429\`** Too many requests. Wait the seconds in \`RateLimit-Reset\`, then retry.
- **\`500\`** Something broke on our side. Retry later, and report it with the request ID.
- **\`504\`** The request took longer than ${timeoutMs / 1000} seconds. Retry, but read first: a write may still have happened.

## Rate limits

${limit} Every response says where you stand:

\`\`\`http
RateLimit-Limit: ${rateLimitPerMinute}
RateLimit-Remaining: 299
RateLimit-Reset: 42
\`\`\`

\`RateLimit-Reset\` is the number of seconds until the window starts over. The sign-in endpoints have their own, stricter limits.

## Request IDs

Every response has an \`X-Request-Id\` header. Send your own (up to 255 letters, digits and \`-_=\`) to trace a request across your systems, or use ours. Include it when you report a problem.

## Conventions

- IDs are opaque strings. Don't parse them.
- Timestamps are ISO 8601 in UTC, like \`2026-10-31T15:04:05.000Z\`.
- A user only ever sees their own data. Another user's record returns \`404\`, never \`403\`, so you can't tell whether it exists.
`
}
