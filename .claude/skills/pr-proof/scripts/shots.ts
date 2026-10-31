// Takes the screenshots a PR needs as proof: each page in every language the
// site has, light and dark, on a desktop and a phone, plus one contact sheet
// per page and screen width so a PR can show all of them in one image.
//
//   bun scripts/shots.ts /pricing/              1280 and 375px, every language, light/dark
//   bun scripts/shots.ts /about/ --before main  before (built from main) and after
//   bun scripts/shots.ts / --click '#menu'      after clicking something
//   bun scripts/shots.ts /docs/ --top           only the first screen, not the whole page
//   bun scripts/shots.ts /about/ --mark '.hero h1'
//                                               ring what changed and add close-ups of it
//   bun scripts/shots.ts /about/ --mark '.hero h1' --note 'now wraps'
//                                               also point an arrow at it with the note,
//                                               for a change that's hard to spot
//   bun scripts/shots.ts --publish              push the last run's sheets (the ones
//                                               you looked at) to the proof branch
//                                               and print the Markdown for the PR
//
// A path in any language brings the others (from skills.config.ts,
// "site.languages"); --langs en limits that. With no paths it shoots
// "site.pages". API calls listed in "site.fakes" get made-up answers, so
// pages that need a backend still show what they would. --mark takes any
// CSS selector and can be given more than once; with --before, the before
// close-ups show the same spot, so a new element is compared with what was
// there. --no-ring keeps the shots clean and --no-zoom skips the close-ups,
// so only what helps a reviewer goes on the sheet. Everything lands in
// .checks/shots/, which ignores itself in git. The before site is built once
// per commit of the ref and kept in .checks/before-site/, so shooting again
// doesn't build it again; --build builds both sites anyway.

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser, Page } from 'playwright';
import { config, languages } from './config';
import { branch, output, repo, run, sh, treeHash } from './git';
import {
  bare,
  build,
  DIST,
  installCommand,
  langOf,
  launch,
  open,
  pages,
  pick,
  pool,
  serve,
} from './harness';

const {
  values: flags,
  positionals,
  tokens,
} = parseArgs({
  allowPositionals: true,
  tokens: true,
  options: {
    langs: { type: 'string', default: languages().join(',') },
    themes: { type: 'string', default: 'light,dark' },
    widths: { type: 'string', default: '1280,375' },
    top: { type: 'boolean' },
    click: { type: 'string' },
    mark: { type: 'string', multiple: true },
    note: { type: 'string' },
    'no-ring': { type: 'boolean' },
    'no-zoom': { type: 'boolean' },
    wait: { type: 'string', default: '0' },
    before: { type: 'string' },
    build: { type: 'boolean' },
    publish: { type: 'boolean' },
    name: { type: 'string' },
  },
});

const CHECKS = '.checks';
const OUT = `${CHECKS}/shots`;
/** The last run's sheets, and the code they were shot from. */
const MANIFEST = `${OUT}/sheets.json`;
// --publish on its own pushes the sheets that were looked at, instead of
// shooting them again.
const publishOnly =
  !!flags.publish &&
  tokens.every(
    (t) => t.kind === 'option' && (t.name === 'publish' || t.name === 'name'),
  );
const langs = flags.langs.split(',');
const themes = flags.themes.split(',') as ('light' | 'dark')[];
const widths = flags.widths.split(',').map(Number);
const asked = positionals.length ? positionals : config().site.pages;
if (flags.note && !flags.mark) {
  console.error('--note points at a --mark, so give one too.');
  process.exit(1);
}
const marks = flags.mark ?? [];
const zooming = marks.length > 0 && !flags['no-zoom'];
// With nothing to ring, point at or zoom in on, --mark has nothing to do.
const marking =
  zooming || (marks.length > 0 && (!flags['no-ring'] || !!flags.note));
if (marks.length && !marking)
  console.warn('--no-ring and --no-zoom with no --note leave nothing to mark.');

type Box = { x: number; y: number; width: number; height: number };
type Shot = {
  path: string;
  lang: string;
  theme: 'light' | 'dark';
  width: number;
  side: 'before' | 'after';
  file: string;
  /** A close-up of what --mark points at, and its width on the page. */
  zoom?: { file: string; width: number };
};

/** Scrolls down the page and back, so anything that waits to be seen shows. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const pause = () => new Promise((r) => setTimeout(r, 60));
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await pause();
    }
    scrollTo(0, 0);
    await pause();
  });
}

/**
 * Runs in the page. Rings what the selectors match (unless `ring` is false)
 * and, when there's a note, draws an arrow to the first match with the note
 * at its tail, above everything else. Returns the area to zoom in on (the
 * first match, plus its arrow and note), or null if nothing matched.
 */
function annotate({
  selectors,
  note,
  ring,
}: {
  selectors: string[];
  note?: string;
  ring: boolean;
}) {
  const INK = '#e5195f';
  const HALO = '#fff';
  const doc = document.documentElement;
  const page = { width: doc.scrollWidth, height: doc.scrollHeight };
  const boxes: Box[] = selectors
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .filter((el) => el.checkVisibility())
    .slice(0, 6)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      x: r.left + scrollX - 6,
      y: r.top + scrollY - 6,
      width: r.width + 12,
      height: r.height + 12,
    }));
  if (!boxes.length) return null;
  const union = (a: Box, b: Box): Box => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  };

  const layer = document.createElement('div');
  layer.className = 'shots-mark';
  layer.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
  doc.append(layer);
  for (const b of ring ? boxes : []) {
    const outline = document.createElement('div');
    outline.style.cssText = `position:absolute;box-sizing:border-box;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;border:3px solid ${INK};border-radius:12px;box-shadow:0 0 0 2px ${HALO},inset 0 0 0 2px ${HALO}`;
    layer.append(outline);
  }

  const target = boxes[0];
  let zoom = target;
  // An arrow and a note are for a change that's hard to spot, so they're
  // only drawn when there's a note.
  if (note) zoom = arrow(target, note);

  // At least 360 by 240 around the middle, so a small mark still shows what
  // it sits in, and at most a screen and a half tall, so a big one still zooms.
  const pad = 32;
  // Near an edge, the room it can't take on one side goes to the other.
  const grow = (start: number, size: number, min: number, max: number) => {
    const want = Math.min(max, Math.max(min, size + 2 * pad));
    const from = Math.min(
      Math.max(0, start + size / 2 - want / 2),
      Math.max(0, max - want),
    );
    return [from, want];
  };
  const [x, width] = grow(zoom.x, zoom.width, 360, page.width);
  const [y, height] = grow(zoom.y, zoom.height, 240, page.height);
  return { x, y, width, height: Math.min(height, 1200) };

  /** Draws an arrow to `to` with `text` at its tail; returns the area of all three. */
  function arrow(to: Box, text: string) {
    // The arrow comes in from the side with more room, and from above unless
    // the mark is near the top. A wide mark gets it at the middle of its edge.
    const right = page.width - (to.x + to.width) > to.x;
    const above = to.y > 140;
    const wide = to.width > page.width * 0.6;
    const head = {
      x: wide ? to.x + to.width / 2 : right ? to.x + to.width + 4 : to.x - 4,
      y: above ? to.y - 4 : to.y + to.height + 4,
    };
    const tail = {
      x: Math.min(
        Math.max(head.x + (right || wide ? 100 : -100), 24),
        page.width - 24,
      ),
      y: head.y + (above ? -90 : 90),
    };
    // A gentle curve: the control point sits off the straight line.
    const bend = right === above ? 0.25 : -0.25;
    const [dx, dy] = [head.x - tail.x, head.y - tail.y];
    const c = {
      x: (tail.x + head.x) / 2 - dy * bend,
      y: (tail.y + head.y) / 2 + dx * bend,
    };
    const angle = Math.atan2(head.y - c.y, head.x - c.x);
    const wing = (turn: number) =>
      `${head.x - 18 * Math.cos(angle + turn)},${head.y - 18 * Math.sin(angle + turn)}`;
    const d = `M${tail.x},${tail.y} Q${c.x},${c.y} ${head.x},${head.y} M${wing(0.5)} L${head.x},${head.y} L${wing(-0.5)}`;
    const stroke = (color: string, width: number) =>
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    layer.insertAdjacentHTML(
      'beforeend',
      `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1">${stroke(HALO, 9)}${stroke(INK, 4)}</svg>`,
    );
    // The close-up is of the first mark, with its arrow and note.
    const label = document.createElement('div');
    label.textContent = text;
    label.style.cssText = `position:absolute;left:0;top:0;width:max-content;max-width:240px;padding:4px 10px;background:${HALO};color:${INK};border:2.5px solid ${INK};border-radius:10px;font:600 16px/1.3 system-ui,sans-serif;rotate:-2deg`;
    layer.append(label);
    const { width, height } = label.getBoundingClientRect();
    const box = {
      x: Math.min(Math.max(tail.x - width / 2, 8), page.width - width - 8),
      y: above ? tail.y - height - 4 : tail.y + 4,
      width,
      height,
    };
    label.style.left = `${box.x}px`;
    label.style.top = `${box.y}px`;
    return union(union(to, { ...tail, width: 1, height: 1 }), box);
  }
}

/** Where each page's marks were in the after shots, for the before close-ups. */
const marked = new Map<string, Box>();

async function shoot(
  browser: Browser,
  site: string,
  chosen: string[],
  side: Shot['side'],
) {
  const shots: Shot[] = [];
  const jobs = chosen.flatMap((path) =>
    widths.flatMap((width) => themes.map((theme) => ({ path, width, theme }))),
  );
  await pool(jobs, 3, async ({ path, width, theme }) => {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 812 : 800 },
      colorScheme: theme,
      // Close-ups are shown bigger than the page, so they need the pixels.
      deviceScaleFactor: width < 768 || zooming ? 2 : 1,
    });
    const page = await context.newPage();
    try {
      await open(page, site + path);
      if (!flags.top) await scrollThrough(page);
      if (flags.click) {
        await page.click(flags.click);
        await page.waitForTimeout(800);
      }
      await page.waitForTimeout(Number(flags.wait));
      const key = `${path} ${width} ${theme}`;
      let area: Box | null = null;
      if (marking) {
        area = await page.evaluate(annotate, {
          selectors: marks,
          note: flags.note,
          ring: !flags['no-ring'],
        });
        if (area && side === 'after') marked.set(key, area);
        // Nothing to ring in the before shot (it's new): show the same spot.
        if (!area && side === 'before') area = marked.get(key) ?? null;
      }
      const name = `${OUT}/${side}/${path.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}.${width}.${theme}`;
      const file = `${name}.png`;
      // Full pages are shrunk on the sheet, so desktop ones stay at one pixel
      // per CSS pixel even when the close-ups need two.
      await page.screenshot({
        path: file,
        fullPage: !flags.top,
        scale: width < 768 ? 'device' : 'css',
      });
      const shot: Shot = { path, lang: langOf(path), theme, width, side, file };
      if (area && zooming) {
        const size = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        const clip = {
          ...area,
          width: Math.min(area.width, size.width - area.x),
          height: Math.min(area.height, size.height - area.y),
        };
        if (clip.width > 0 && clip.height > 0) {
          await page.screenshot({
            path: `${name}.zoom.png`,
            fullPage: true,
            clip,
          });
          shot.zoom = { file: `${name}.zoom.png`, width: clip.width };
        }
      }
      shots.push(shot);
    } finally {
      await context.close();
    }
  });
  return shots;
}

/**
 * Builds another commit's site for the before shots, in a worktree with its
 * own dependencies. The build is kept in .checks/before-site/ and used again
 * until the ref moves or the build settings change. Returns its pages' folder.
 */
function buildBefore(ref: string) {
  // Branches start from origin/main and the local main is often old, so a
  // branch name means its latest version on GitHub when there is one.
  output(['git', 'fetch', '-q', 'origin', ref]);
  const sha =
    output(['git', 'rev-parse', '--verify', '-q', `origin/${ref}^{commit}`]) ||
    output(['git', 'rev-parse', '--verify', '-q', `${ref}^{commit}`]);
  if (!sha) {
    console.error(`There's no commit called ${ref}.`);
    process.exit(1);
  }
  const { build: command, dist, install } = config().site;
  const kept = `${CHECKS}/before-site`;
  const stamp = JSON.stringify({ sha, command, dist, install });
  if (
    !flags.build &&
    existsSync(`${kept}/dist`) &&
    existsSync(`${kept}/built-from.json`) &&
    readFileSync(`${kept}/built-from.json`, 'utf8') === stamp
  ) {
    console.log(
      `Before: ${ref} at ${sha.slice(0, 7)}, built on an earlier run.`,
    );
    return `${kept}/dist`;
  }
  rmSync(kept, { recursive: true, force: true });
  const dir = `${CHECKS}/before`;
  if (existsSync(dir)) run(['git', 'worktree', 'remove', '--force', dir]);
  rmSync(dir, { recursive: true, force: true });
  run(['git', 'worktree', 'prune']);
  if (run(['git', 'worktree', 'add', '-q', '--detach', dir, sha]) !== 0)
    process.exit(1);
  const installing = installCommand(dir);
  if (installing) {
    console.log(`Installing ${ref}'s dependencies: ${installing}`);
    if (sh(installing, dir) !== 0) {
      console.error('The install failed.');
      process.exit(1);
    }
  } else if (existsSync('node_modules'))
    symlinkSync(resolve('node_modules'), `${dir}/node_modules`);
  build(true, dir);
  mkdirSync(kept, { recursive: true });
  renameSync(join(dir, DIST()), `${kept}/dist`);
  writeFileSync(`${kept}/built-from.json`, stamp);
  run(['git', 'worktree', 'remove', '--force', dir]);
  return `${kept}/dist`;
}

/** True when every before shot is the same image as its after shot. */
function unchanged(shots: Shot[]) {
  const before = shots.filter((s) => s.side === 'before');
  return (
    before.length > 0 &&
    before.every((b) => {
      const a = shots.find(
        (s) =>
          s.side === 'after' &&
          s.path === b.path &&
          s.width === b.width &&
          s.theme === b.theme,
      );
      return a && readFileSync(a.file).equals(readFileSync(b.file));
    })
  );
}

/**
 * One sheet per page and screen width: a column per language and a row per
 * theme (and before/after), each labelled, with the close-ups on top when
 * there are marks. Drawn as a web page and screenshotted, so it needs
 * nothing but a browser.
 */
async function sheet(
  browser: Browser,
  page: string,
  width: number,
  shots: Shot[],
) {
  const before = shots.some((s) => s.side === 'before');
  const sides = before ? (['before', 'after'] as const) : (['after'] as const);
  const img = (file: string, size: number) =>
    `<img src="data:image/png;base64,${readFileSync(file).toString('base64')}" style="width:${size}px">`;
  const kinds = [
    // Close-ups at one and a half times their size on the page.
    {
      name: 'close-up',
      cell: (s: Shot) =>
        s.zoom ? img(s.zoom.file, Math.min(s.zoom.width * 1.5, 640)) : '',
    },
    { name: '', cell: (s: Shot) => img(s.file, width < 768 ? 260 : 440) },
  ].filter((kind) => kind.name !== 'close-up' || shots.some((s) => s.zoom));
  const rows = kinds.flatMap((kind) =>
    themes.flatMap((theme) =>
      sides.map((side) => {
        const label = [kind.name, before && side, theme]
          .filter(Boolean)
          .join(' · ');
        const cells = langs.map((lang) => {
          const shot = shots.find(
            (s) => s.side === side && s.theme === theme && s.lang === lang,
          );
          return `<td style="vertical-align:top">${shot ? kind.cell(shot) : ''}</td>`;
        });
        return `<tr><th style="writing-mode:vertical-rl;transform:rotate(180deg)">${label}</th>${cells.join('')}</tr>`;
      }),
    ),
  );
  const html = `<body style="margin:0;padding:16px;width:max-content;background:#eee;font:14px system-ui;color:#222">
    <h1 style="font-size:16px;margin:0 0 12px">${page} at ${width}px</h1>
    <table style="border-spacing:12px 8px"><tr><th></th>${langs.map((l) => `<th>${l}</th>`).join('')}</tr>
    ${rows.join('')}</table></body>`;
  const tab = await browser.newPage({ deviceScaleFactor: 1 });
  await tab.setContent(html, { waitUntil: 'load' });
  const name = bare(page).replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
  const file = `${OUT}/${name}.${width}.png`;
  await tab.screenshot({ path: file, fullPage: true });
  await tab.close();
  return file;
}

/**
 * Pushes the sheets to the proof branch ("proof.branch", made on first use)
 * and prints the Markdown for the PR.
 */
function publish(files: string[]) {
  const proof = config().proof.branch;
  const name = flags.name ?? branch().replace(/^[a-z]+\//, '');
  const dir = `${CHECKS}/proof`;
  if (existsSync(dir)) run(['git', 'worktree', 'remove', '--force', dir]);
  rmSync(dir, { recursive: true, force: true });
  // In English whatever the locale, to tell the cases apart.
  const fetched = spawnSync('git', ['fetch', '-q', 'origin', proof], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  const why = (fetched.stderr ?? '').trim();
  // On first use the branch isn't there yet, which git calls fatal. Any
  // other failure (offline, signed out) stops here, with git's reason.
  const exists = fetched.status === 0;
  if (!exists && !/couldn't find remote ref/i.test(why)) {
    console.error(why || `git fetch origin ${proof} failed.`);
    process.exit(1);
  }
  if (exists) {
    if (
      run(['git', 'worktree', 'add', '-q', '--detach', dir, `origin/${proof}`])
    )
      process.exit(1);
  } else {
    // A branch with no history of its own, so it never mixes with the code.
    if (run(['git', 'worktree', 'add', '-q', '--detach', dir])) process.exit(1);
    run(['git', 'checkout', '-q', '--orphan', `${proof}-new`], dir);
    run(['git', 'rm', '-rfq', '.'], dir);
  }
  mkdirSync(`${dir}/${name}`, { recursive: true });
  for (const file of files)
    cpSync(file, `${dir}/${name}/${file.split('/').pop()}`);
  run(['git', 'add', name], dir);
  run(['git', 'commit', '-q', '-m', `chore(proof): ${name}`], dir);
  if (run(['git', 'push', '-q', 'origin', `HEAD:${proof}`], dir) !== 0)
    process.exit(1);
  run(['git', 'worktree', 'remove', '--force', dir]);
  if (!exists) run(['git', 'branch', '-q', '-D', `${proof}-new`]);
  console.log('\nFor the PR description:\n');
  for (const file of files) {
    const base = file.split('/').pop()!;
    const url = config()
      .proof.image.replaceAll('{repo}', repo())
      .replaceAll('{branch}', proof)
      .replaceAll('{path}', `${name}/${base}`);
    console.log(`![${base.replace(/\.png$/, '')}](${url})`);
  }
}

if (publishOnly) {
  if (!existsSync(MANIFEST)) {
    console.error(
      'No sheets to publish: shoot first, look at them, then publish.',
    );
    process.exit(1);
  }
  const last = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    tree: string;
    sheets: string[];
  };
  const now = treeHash();
  if (!last.tree || !now || last.tree !== now)
    console.log(
      '! The code changed since these sheets were shot. If that change shows on a page, shoot again first.',
    );
  publish(last.sheets);
  process.exit(0);
}

build(flags.build);
const chosen = pick(pages(), asked, true).filter((p) =>
  langs.includes(langOf(p)),
);
if (!chosen.length) {
  console.error(`No pages match ${asked.join(' ')}`);
  process.exit(1);
}
// Ignores itself, so nothing here ever needs a .gitignore line. Written
// first, so the before build kept in it never shows up in git.
mkdirSync(CHECKS, { recursive: true });
writeFileSync(`${CHECKS}/.gitignore`, '*\n');
// The before site first: it's the build most likely to fail, so nothing is
// shot until both sites are ready.
const beforeDist = flags.before ? buildBefore(flags.before) : '';
const tree = treeHash();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/after`, { recursive: true });
mkdirSync(`${OUT}/before`, { recursive: true });
const browser = await launch();
const after = await serve();
const shots = await shoot(browser, after.url, chosen, 'after');
after.stop();
if (beforeDist) {
  const before = await serve(beforeDist);
  const old = new Set(pages(beforeDist));
  const existed = chosen.filter((p) => old.has(p));
  for (const p of chosen)
    if (!old.has(p)) console.log(`${p} is new: no before shot.`);
  shots.push(...(await shoot(browser, before.url, existed, 'before')));
  before.stop();
  // New pages are a change of their own.
  if (existed.length === chosen.length && unchanged(shots))
    console.log(
      "! Before and after are the same in every shot: the change isn't on these pages, or the build didn't pick it up.",
    );
}

await browser.close();

// The sheets get a browser of their own: after a heavy WebGL page, the first
// one sometimes can't take screenshots any more.
const drawer = await launch({ webgl: false });
const sheets: string[] = [];
for (const page of new Set(chosen.map(bare)))
  for (const width of widths) {
    const mine = shots.filter(
      (s) => s.width === width && bare(s.path) === page,
    );
    if (mine.length) sheets.push(await sheet(drawer, page, width, mine));
  }
await drawer.close();
writeFileSync(MANIFEST, JSON.stringify({ tree, sheets }, null, 2));
console.log(
  `${shots.length} screenshots in ${OUT}/after${beforeDist ? ' and before' : ''}, sheets:`,
);
for (const file of sheets) console.log(`  ${file}`);
if (flags.publish) publish(sheets);
