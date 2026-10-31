// What page checks share: building the site, serving its build folder the
// way a static host would (with API calls faked from skills.config.ts),
// listing its pages, and opening them in Chromium. shots.ts uses it, and a
// project's own page checks can too (see examples/ in chanlito/skills).

import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { config, languages } from './config';
import { sh } from './git';

export const DIST = () => config().site.dist;

/**
 * Folders that are never the site's source, however a source is named: a
 * workspace package's node_modules would walk every dependency.
 */
const NOT_SOURCE = new Set(['node_modules', '.git']);

/** When anything the build reads last changed. */
function sourcesChanged(cwd: string) {
  let newest = 0;
  // Links are followed, so a linked folder of content still counts, but
  // each folder is read once, so a link back up can't loop, and the build
  // itself never counts as a source.
  const seen = new Set<string>();
  const built = join(cwd, DIST());
  if (existsSync(built)) {
    const stat = statSync(built);
    seen.add(`${stat.dev}:${stat.ino}`);
  }
  const visit = (path: string) => {
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return; // gone, or a broken link
    }
    // A folder's time changes when a file in it is added, deleted or renamed.
    newest = Math.max(newest, stat.mtimeMs);
    if (!stat.isDirectory()) return;
    const id = `${stat.dev}:${stat.ino}`;
    if (seen.has(id)) return;
    seen.add(id);
    for (const name of readdirSync(path))
      if (!NOT_SOURCE.has(name)) visit(join(path, name));
  };
  for (const path of config().site.sources) visit(join(cwd, path));
  return newest;
}

/**
 * How to install dependencies in a checkout of the project at `cwd`: the
 * "site.install" setting, or for a workspace monorepo the install its
 * lockfile calls for. Empty when borrowing this checkout's node_modules is
 * enough. A monorepo can't borrow them: its node_modules link its own
 * packages, so a before build would bundle the branch's code.
 */
export function installCommand(cwd = '.') {
  const { install } = config().site;
  if (install) return install;
  const has = (file: string) => existsSync(join(cwd, file));
  let workspaces = has('pnpm-workspace.yaml');
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    workspaces ||= Boolean(pkg.workspaces);
  } catch {}
  if (!workspaces) return '';
  if (has('bun.lock') || has('bun.lockb'))
    return 'bun install --frozen-lockfile';
  if (has('pnpm-lock.yaml')) return 'pnpm install --frozen-lockfile';
  if (has('yarn.lock')) return 'yarn install --frozen-lockfile';
  if (has('package-lock.json')) return 'npm ci';
  return 'npm install';
}

/** Builds the site when its build is missing or older than its sources (or `force`). */
export function build(force = false, cwd = '.') {
  const built = join(cwd, DIST(), 'index.html');
  if (
    !force &&
    existsSync(built) &&
    statSync(built).mtimeMs > sourcesChanged(cwd)
  )
    return;
  console.log(`Building the site: ${config().site.build}`);
  if (sh(config().site.build, cwd) !== 0) {
    console.error('The build failed.');
    process.exit(1);
  }
}

/** Every page in the build, as the path it's served at: /, /fr/about/, /404. */
export function pages(dist = DIST()) {
  const found: string[] = [];
  for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.html')) continue;
    const path = '/' + file.replaceAll('\\', '/');
    found.push(
      path.endsWith('/index.html')
        ? path.slice(0, -'index.html'.length)
        : path.slice(0, -'.html'.length),
    );
  }
  return found.sort();
}

/** The language a page is in, from its path. */
export function langOf(path: string) {
  const { default: main, prefixed } = config().site.languages;
  return prefixed.find((lang) => path.startsWith(`/${lang}/`)) ?? main;
}

/** A page's path without its language prefix: /fr/about/ is /about/. */
export function bare(path: string) {
  const lang = langOf(path);
  return lang === config().site.languages.default
    ? path
    : path.slice(lang.length + 1);
}

/**
 * Picks pages by what was asked for: exact paths (/about/), or a path with a
 * trailing * for everything under it (/articles/*). Nothing asked for means
 * every page. With `allLangs`, a path in one language brings its versions in
 * the others, since most changes show up in all of them.
 */
export function pick(all: string[], asked: string[], allLangs = false) {
  if (!asked.length) return all;
  const { default: main } = config().site.languages;
  const wanted = new Set<string>();
  for (const raw of asked) {
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    const variants = allLangs
      ? languages().map((l) => (l === main ? bare(path) : `/${l}${bare(path)}`))
      : [path];
    for (const v of variants) {
      const matches = v.endsWith('*')
        ? all.filter((p) => p.startsWith(v.slice(0, -1)))
        : all.filter((p) => p === v || p === `${v}/`);
      for (const m of matches) wanted.add(m);
    }
  }
  return all.filter((p) => wanted.has(p));
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};

/** The made-up answer for an API call, from "fakes", or undefined. */
function fake(pathname: string, method: string) {
  for (const [prefix, answers] of Object.entries(config().site.fakes))
    if (pathname.startsWith(prefix)) return answers[method] ?? answers['*'];
}

/**
 * Serves a built site on a free port on 127.0.0.1, like a static host: /x/
 * is x/index.html, /x is x.html or x/index.html, and unknown paths get
 * 404.html. Paths listed in "fakes" answer with their made-up JSON.
 */
export async function serve(dist = DIST()) {
  const root = resolve(dist);
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const answer = fake(url.pathname, request.method ?? 'GET');
    if (answer !== undefined) {
      response.setHeader('content-type', TYPES['.json']);
      response.end(JSON.stringify(answer));
      return;
    }
    // A path that can't be decoded gets the 404 page.
    let file = '';
    try {
      file = join(root, decodeURIComponent(url.pathname));
    } catch {}
    if (file && url.pathname.endsWith('/')) file = join(file, 'index.html');
    else if (file && !extname(file) && existsSync(`${file}.html`))
      file += '.html';
    else if (file && !extname(file) && existsSync(join(file, 'index.html')))
      file = join(file, 'index.html');
    if (
      !file.startsWith(root + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      file = join(root, '404.html');
      response.statusCode = 404;
      if (!existsSync(file)) {
        response.end('Not found');
        return;
      }
    }
    response.setHeader('content-type', TYPES[extname(file)] ?? '');
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, stop: () => server.close() };
}

/**
 * Starts Chromium, with a hint if Playwright's browser isn't installed.
 * Headless Chromium draws WebGL in software, which can make every frame of a
 * 3D page take most of a second, so checks that only measure can turn it off
 * with `webgl: false`.
 */
export async function launch({ webgl = true } = {}): Promise<Browser> {
  const args = [...config().site.chromium];
  if (!webgl) args.push('--disable-3d-apis');
  try {
    return await chromium.launch({ args });
  } catch (error) {
    console.error(
      'Chromium did not start. Install it once with `npx playwright install chromium`.',
    );
    throw error;
  }
}

/** Opens a page and waits until it has settled: loaded, fonts in, a few frames drawn. */
export async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 6; i++) await frame();
  });
  await page.waitForTimeout(250);
}

/** Runs `work` on each item with at most `limit` running at once. */
export async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}
