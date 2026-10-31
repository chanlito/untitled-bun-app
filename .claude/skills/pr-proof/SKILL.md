---
name: pr-proof
description: Prove a web change works with screenshots for its pull request, in every language, light and dark, desktop and phone, before and after, zoomed in on the change and marked only as much as it needs. Use for any change with a screen, before opening or updating a PR.
---

# PR proof

Green checks don't prove a change works; they prove nothing broke that a test knew about. Proof is something a reviewer can look at: the page before and after, with what changed pointed out. This skill takes those screenshots, puts them on one contact sheet per page and screen width, and links them from the PR.

In the commands below, `$SKILL` is this skill's folder (for example `.claude/skills/pr-proof`). Run them with bun from the repo's root. They need Playwright (`npm i -D playwright` or `bun add -d playwright`) and its Chromium, once: `npx playwright install chromium`.

## 1. Read the lessons

`bun $SKILL/scripts/lessons.ts` prints what earlier changes taught this skill in this project. Follow them.

## 2. Shoot

```sh
bun $SKILL/scripts/shots.ts <changed pages> --before main --mark '<what changed>'
```

It builds the site when the build is older than the code, serves it on 127.0.0.1, and shoots each page in every language, light and dark, at 1280 and 375px. With `--before main` it also builds the latest `origin/main` in a git worktree and shoots the same pages there, and it says which pages are new.

- `--mark '<selector>'` says where the change is: it rings the element in every shot and puts before and after close-ups at the top of each sheet. Give `--mark` more than once for several things. When the element is new, the before close-up shows the same spot.
- `--note '<what to look at>'` adds an arrow to the first mark with the note at its tail.
- `--no-ring` leaves the shots clean, and `--no-zoom` skips the close-ups.

### Choose how to show it

Show the change with as little drawing as it needs; every extra mark is something the reviewer has to read past. You decide per change:

- **A close-up alone** (`--mark` with `--no-ring`) when the close-up already makes the change obvious: a new button, a reworded heading, a recoloured card.
- **A ring** (`--mark`) when the change is small on a busy page, so the reviewer finds it in the full-page shots too.
- **An arrow and a note** (`--mark` with `--note`) only when it's still hard to spot or to tell what changed: a 2px shift, a spacing fix, a subtle colour, one word in a paragraph. The note says what to compare, like `was 2 lines`.
- **No `--mark` at all** when the whole page is the change (a new page, a redesign).
- **`--no-zoom`** when you marked something big, like a whole section, and its ring on the full shots already says it.

Then look at the sheet, and if a mark only repeats what's already plain, shoot again without it.

- `--click '<selector>'` shoots after a click (a menu, a dialog, a toggle). `--wait <ms>` waits longer before shooting.
- `--top` takes only the first screen of a long page.
- `--langs en`, `--themes light`, `--widths 1280,768` limit what's shot. Skip other languages only when the change has no text.
- A path in any language brings the others. `/docs/*` takes every page under `/docs/`.

## 3. Look at the sheets

They land in `.checks/shots/` (which git ignores by itself). Open each one and look before you paste it anywhere: a sheet only proves what you checked on it. Look for the change in every language and theme, for text that wraps or overflows, and for anything that moved that shouldn't have.

## 4. Publish

```sh
bun $SKILL/scripts/shots.ts <same arguments> --publish
```

It pushes the sheets to the proof branch (`pr-proof` by default, made on first use with no history of its own) and prints Markdown image links for the PR's Evidence section. Put a line above each sheet saying what to look at. A private repo's images need the `proof.image` setting below.

When the project has a preview deploy, its link goes at the very top of the PR too (the pr-writing skill does that).

## 5. Improve this skill

Before calling the work done, ask what this change taught about proof:

- **A bug got past the proof** (the review, the preview or a person found it): could a shot have shown it? Then change what you shoot next time (another width, `--click`, dark mode) and add a lesson saying so. If the project needs a new kind of page check, write it as the project's own script next to the code (the harness in `$SKILL/scripts/harness.ts` builds, serves and opens pages for it) and add it to `checks` in `skills.config.ts`.
- **Something cost a retry or a workaround** the next agent will hit too: add a lesson with `bun $SKILL/scripts/lessons.ts add "<what to do>" --pr <number>`.
- **A person corrected your proof:** add a lesson, in their words.
- **A lesson is now handled by a setting, a check or a step, or turned out wrong:** `bun $SKILL/scripts/lessons.ts drop <n>`.

Each lesson is one line about what to do. Where they're kept depends on `lessons` in `skills.config.ts`: in this clone only (`local`, the default), committed and reviewed in PRs (`commit`), or nowhere (`off`). Don't edit this skill's own files for a project's lessons: an update replaces them. A fix that would help every project belongs upstream, in chanlito/skills.

## Settings

`skills.config.ts` at the repo root, all optional:

- `site.build`: the build command (`npm run build`), and `site.dist`: where it writes the pages (`dist`).
- `site.sources`: what the build reads, to know when to rebuild.
- `site.pages`: what to shoot when no pages are named (`["/"]`).
- `site.languages`: `{ "default": "en", "prefixed": ["fr", "de"] }` for pages at `/fr/…` and `/de/…`.
- `site.fakes`: made-up answers for API calls, like `{ "/api/me": { "GET": { "name": "Ada" }, "*": { "ok": true } } }`.
- `site.chromium`: extra Chromium flags.
- `proof.branch`: where sheets are pushed. `proof.image`: the image link, with `{repo}`, `{branch}` and `{path}`. The default raw.githubusercontent.com link only works for public repos; for a private one use `https://github.com/{repo}/blob/{branch}/{path}?raw=true`.
