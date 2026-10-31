import { config } from '@untitled-bun-app/config'
import { html, raw } from 'hono/html'

type LandingOptions = {
  apiUrl: string
  version: string
  environment: string
}

// What GET / tells a client that asks for JSON (curl, fetch, monitors): where to go next
export function landingJson({ apiUrl, version, environment }: LandingOptions) {
  return {
    name: config.name,
    description: config.description,
    version,
    environment,
    links: {
      reference: `${apiUrl}/reference`,
      openapi: `${apiUrl}/doc`,
      health: `${apiUrl}/health`,
    },
  }
}

// The page has no scripts and only its own inline styles, so it gets a CSP that allows
// nothing else. Scalar's page at /reference can't have one: it loads its script from a CDN.
export const LANDING_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

// A small favicon so browsers stop asking for /favicon.ico (a 404 on an API)
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#111418"/><path d="M9 11l6 5-6 5M17 21h6" stroke="#f5c451" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`

// The JSON a client gets, pretty-printed with keys and strings marked for colour, and URLs
// as links. It handles nested objects of strings, which is all landingJson returns (no
// arrays). Built as a string (an html`` template would get its whitespace reformatted) with
// every value escaped, so text from config or env can't break out of the page.
function highlightJson(value: unknown, indent = ''): string {
  if (typeof value === 'string') {
    const text = Bun.escapeHTML(JSON.stringify(value))
    return /^https?:\/\//.test(value)
      ? `<a class="s" href="${Bun.escapeHTML(value)}">${text}</a>`
      : `<span class="s">${text}</span>`
  }
  if (value === null || typeof value !== 'object') return Bun.escapeHTML(String(value))
  const inner = `${indent}  `
  const lines = Object.entries(value).map(
    ([key, v]) =>
      `${inner}<span class="k">${Bun.escapeHTML(JSON.stringify(key))}</span>: ${highlightJson(v, inner)}`,
  )
  return `{\n${lines.join(',\n')}\n${indent}}`
}

// What a browser sees at GET /: the page is a terminal showing what `curl /` returns, with
// the links in the JSON clickable. Light or dark follows the browser. Everything comes from
// the project's config and env, so it suits any API built from the template.
export function landingPage(options: LandingOptions) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>${config.name} API</title>
        <meta name="description" content="${config.description}" />
        <link rel="icon" href="${FAVICON}" />
        <style>
          :root {
            --bg: #ffffff;
            --text: #1f2328;
            --muted: #636c76;
            --key: #0550ae;
            --string: #116329;
            --cursor: #9a6700;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #0b0d10;
              --text: #d4d8de;
              --muted: #8b949e;
              --key: #7dd3fc;
              --string: #a5d6a7;
              --cursor: #f5c451;
            }
          }
          body {
            margin: 0;
            padding: 40px 48px;
            background: var(--bg);
            color: var(--text);
            font:
              15px/1.7 ui-monospace,
              SFMono-Regular,
              Menlo,
              Consolas,
              monospace;
          }
          main {
            display: grid;
            gap: 4px;
          }
          p,
          pre {
            margin: 0;
          }
          pre {
            font: inherit;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }
          .m {
            color: var(--muted);
          }
          .k {
            color: var(--key);
          }
          .s {
            color: var(--string);
          }
          a.s {
            text-decoration: underline;
            text-decoration-color: var(--muted);
            text-underline-offset: 3px;
          }
          a.s:hover {
            text-decoration-color: currentColor;
          }
          a.s:focus-visible {
            outline: 2px solid var(--cursor);
            outline-offset: 2px;
            border-radius: 2px;
          }
          .cursor {
            display: inline-block;
            width: 9px;
            height: 18px;
            vertical-align: -3px;
            background: var(--cursor);
            animation: blink 1.1s steps(1) infinite;
          }
          @keyframes blink {
            50% {
              opacity: 0;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .cursor {
              animation: none;
            }
          }
          @media (max-width: 560px) {
            body {
              padding: 20px 16px;
              font-size: 13px;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <p><span class="m">$</span> curl -s ${options.apiUrl}/ | jq</p>
          <pre>${raw(highlightJson(landingJson(options)))}</pre>
          <p aria-hidden="true"><span class="m">$</span> <span class="cursor"></span></p>
        </main>
      </body>
    </html>`
}
