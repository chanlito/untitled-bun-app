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

// The JSON a client gets, pretty-printed with keys and strings marked for colour. It handles
// nested objects of strings, which is all landingJson returns (no arrays). Built as a string
// (an html`` template would get its whitespace reformatted) with every value escaped,
// so text from config or env can't break out of the page.
function highlightJson(value: unknown, indent = ''): string {
  if (typeof value === 'string')
    return `<span class="s">${Bun.escapeHTML(JSON.stringify(value))}</span>`
  if (value === null || typeof value !== 'object') return Bun.escapeHTML(String(value))
  const inner = `${indent}  `
  const lines = Object.entries(value).map(
    ([key, v]) =>
      `${inner}<span class="k">${Bun.escapeHTML(JSON.stringify(key))}</span>: ${highlightJson(v, inner)}`,
  )
  return `{\n${lines.join(',\n')}\n${indent}}`
}

// What a browser sees at GET /: a terminal session showing what `curl /` returns, then the
// links a developer wants first. Light or dark follows the browser. Everything comes from
// the project's config and env, so it suits any API built from the template.
export function landingPage(options: LandingOptions) {
  const { apiUrl } = options
  const links = [
    { href: '/reference', text: 'every endpoint, with a client to try it' },
    { href: '/doc', text: 'the OpenAPI 3.1 spec, for generated clients' },
    { href: '/health', text: 'what load balancers and monitors poll' },
  ]
  const width = Math.max(...links.map((link) => link.href.length)) + 3

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
            --bg: #f3f4f6;
            --window: #ffffff;
            --bar: #f8f9fa;
            --border: #dfe2e6;
            --text: #1f2328;
            --muted: #636c76;
            --key: #0550ae;
            --string: #116329;
            --accent: #9a6700;
            --dot: #d0d4d9;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #0b0d10;
              --window: #111418;
              --bar: #111418;
              --border: #23272e;
              --text: #d4d8de;
              --muted: #8b949e;
              --key: #7dd3fc;
              --string: #a5d6a7;
              --accent: #f5c451;
              --dot: #2a2f37;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 32px 16px;
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
            width: 100%;
            max-width: 760px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: var(--window);
            overflow: hidden;
          }
          .bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-bottom: 1px solid var(--border);
            background: var(--bar);
            color: var(--muted);
            font-size: 12px;
          }
          .bar i {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--dot);
          }
          .bar span {
            flex: 1;
            text-align: center;
            margin-right: 54px;
          }
          .screen {
            padding: 28px 32px 32px;
            display: grid;
            gap: 20px;
            overflow-x: auto;
          }
          h1 {
            margin: 0;
            color: var(--accent);
            font-size: 22px;
            line-height: 1.4;
            letter-spacing: -0.01em;
          }
          p,
          pre {
            margin: 0;
          }
          pre {
            font: inherit;
            white-space: pre;
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
          nav {
            display: grid;
          }
          nav a {
            color: var(--text);
            text-decoration: none;
            white-space: pre;
            border-radius: 4px;
          }
          nav a b {
            font-weight: inherit;
            color: var(--key);
          }
          nav a:hover b,
          nav a:focus-visible b {
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          nav a:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
          }
          .cursor {
            display: inline-block;
            width: 9px;
            height: 18px;
            vertical-align: -3px;
            background: var(--accent);
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
            pre {
              white-space: pre-wrap;
              overflow-wrap: anywhere;
            }
            nav a {
              white-space: normal;
            }
            nav .pad {
              display: none;
            }
            nav .d {
              display: block;
              padding-left: 2ch;
            }
          }
          @media (max-width: 480px) {
            body {
              font-size: 13px;
            }
            .screen {
              padding: 20px 16px 24px;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <div class="bar" aria-hidden="true">
            <i></i><i></i><i></i><span>${new URL(apiUrl).host}</span>
          </div>
          <div class="screen">
            <div>
              <h1>${config.name} API</h1>
              <p class="m"># ${config.description}</p>
            </div>
            <div>
              <p><span class="m">$</span> curl -s ${apiUrl}/ | jq</p>
              <pre>${raw(highlightJson(landingJson(options)))}</pre>
            </div>
            <nav aria-label="Where to go next">
              <span class="m"># where to go next</span>
              ${links.map(
                (link) =>
                  html`<a href="${link.href}"
                    ><span class="m">→</span> <b>${link.href}</b
                    ><span class="pad">${' '.repeat(width - link.href.length)}</span
                    ><span class="m d">${link.text}</span></a
                  >`,
              )}
            </nav>
            <p aria-hidden="true"><span class="m">$</span> <span class="cursor"></span></p>
          </div>
        </main>
      </body>
    </html>`
}
