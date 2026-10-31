import { config } from '@untitled-bun-app/config'
import { html } from 'hono/html'

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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#5b5bd6"/><path d="M10 11l6 5-6 5M18 21h5" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`

// What a browser sees at GET /: the project's name and the links a developer wants first.
// Everything comes from the project's config and the running config, so it suits any API.
export function landingPage({ apiUrl, version, environment }: LandingOptions) {
  const links = [
    { href: '/reference', title: 'API reference', text: 'Every endpoint, with a client to try it' },
    { href: '/doc', title: 'OpenAPI spec', text: 'The 3.1 document, for generated clients' },
    { href: '/health', title: 'Health check', text: 'What load balancers and monitors poll' },
  ]

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
            --bg: #f7f7f8;
            --card: #ffffff;
            --text: #1c1c21;
            --muted: #65656f;
            --border: #e4e4e9;
            --accent: #5b5bd6;
            --ok: #2f9e5a;
            --code: #f0f0f3;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #111113;
              --card: #18181b;
              --text: #ededef;
              --muted: #a0a0ab;
              --border: #2a2a30;
              --accent: #8e8ef0;
              --ok: #4cc27a;
              --code: #222227;
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
            padding: 24px 16px;
            background: var(--bg);
            color: var(--text);
            font:
              16px/1.5 ui-sans-serif,
              system-ui,
              -apple-system,
              'Segoe UI',
              sans-serif;
          }
          main {
            width: 100%;
            max-width: 560px;
          }
          .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--muted);
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--ok);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 20%, transparent);
          }
          h1 {
            margin: 12px 0 4px;
            font-size: 28px;
            line-height: 1.2;
            letter-spacing: -0.02em;
          }
          .lede {
            margin: 0 0 20px;
            color: var(--muted);
          }
          .meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 24px;
          }
          .pill {
            font:
              12px/1 ui-monospace,
              SFMono-Regular,
              Menlo,
              monospace;
            padding: 6px 10px;
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--card);
            color: var(--muted);
          }
          .pill b {
            color: var(--text);
            font-weight: 600;
          }
          nav {
            display: grid;
            gap: 8px;
          }
          nav a {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 2px 12px;
            padding: 14px 16px;
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--card);
            color: inherit;
            text-decoration: none;
            transition:
              border-color 120ms,
              transform 120ms;
          }
          nav a:hover,
          nav a:focus-visible {
            border-color: var(--accent);
            transform: translateY(-1px);
          }
          nav a:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
          }
          nav strong {
            font-weight: 600;
          }
          nav code {
            grid-row: span 2;
            align-self: center;
            color: var(--accent);
          }
          nav span {
            color: var(--muted);
            font-size: 14px;
          }
          code {
            font:
              13px ui-monospace,
              SFMono-Regular,
              Menlo,
              monospace;
          }
          pre {
            margin: 24px 0 0;
            padding: 12px 14px;
            border-radius: 10px;
            background: var(--code);
            overflow-x: auto;
          }
          pre code::before {
            content: '$ ';
            color: var(--muted);
            user-select: none;
          }
          @media (prefers-reduced-motion: reduce) {
            nav a {
              transition: none;
            }
            nav a:hover {
              transform: none;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <span class="status"><span class="dot"></span>Up and serving requests</span>
          <h1>${config.name} API</h1>
          <p class="lede">${config.description}</p>
          <div class="meta">
            <span class="pill">version <b>${version}</b></span>
            <span class="pill">env <b>${environment}</b></span>
          </div>
          <nav>
            ${links.map(
              (link) =>
                html`<a href="${link.href}"
                  ><strong>${link.title}</strong><code>${link.href}</code
                  ><span>${link.text}</span></a
                >`,
            )}
          </nav>
          <pre><code>curl ${apiUrl}/health</code></pre>
        </main>
      </body>
    </html>`
}
