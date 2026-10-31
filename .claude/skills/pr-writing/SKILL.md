---
name: pr-writing
description: Get a branch ready to push and write its pull request, with the project's checks passing, the preview link at the top, the risk tier, a small picture of the change, before-and-after evidence, and the merge danger (one-way or two-way door, blast radius). Use before every push and whenever opening or updating a PR.
---

# PR writing

A pull request is for the person reviewing it, who wasn't there while it was made. They should find the preview link without looking, see how risky it is in one line, and see proof instead of being told it works. This skill checks the branch before a push and writes the PR from the project's template.

In the commands below, `$SKILL` is this skill's folder (for example `.claude/skills/pr-writing`). Run them with bun from the repo's root.

## 1. Read the lessons

`bun $SKILL/scripts/lessons.ts` prints what earlier changes taught this skill in this project. Follow them.

## 2. Branch

Start from an up-to-date base: `git fetch origin main && git switch -c <type>/<what> origin/main`, with a name that says what the work is, like `feat/csv-export` or `fix/header-overflow`. Connected work goes in one branch and one PR.

## 3. Check before every push

```sh
bun $SKILL/scripts/check.ts
```

It checks the branch name and the commit subjects against the project's format, runs the project's own checks (`checks` in `show-your-work.json`, such as format, type-check, tests and build), and prints the risk tier and the preview link. It must end with `✓ Ready to push.` When it fails, fix the cause and run it again. Don't push around it.

## 4. Get the tier and the proof

- The tier and the reviews it calls for come from the **pr-risks** skill. Follow it.
- For Medium and High changes with a screen, the screenshots come from the **pr-proof** skill. Follow it and keep the Markdown it prints.

## 5. Write the PR

```sh
bun $SKILL/scripts/body.ts
```

It prints the project's PR template (or this skill's `template.md` when there's none) with the preview link and the suggested tier filled in. Fill in the rest. Skip preambles and keep the prose short. Use the project's own words for things (its `GLOSSARY.md` if it has one), not names you made up while working. If the repo's template has other sections, fill them in too; don't drop them.

- **Preview link at the very top**, and in your message about the PR too. People shouldn't have to look for it.
- **Tier** with its one-line reason, and the label. Raise it if pr-risks says paths can't tell.
- **Summary:** one or two sentences on what someone using it would notice, then the smallest picture that makes the point. Not a list of files.
- **Evidence:** before and after.
- **Merge danger:** the door and the blast radius.
- **Review:** what each review round found and what was fixed, and the Skills line (step 6).

Keep the PR description up to date when the change changes.

### Summary: the smallest picture

Pick one, sometimes two, and put each next to the sentence it explains. Keep only the calls, files, props and states the reviewer needs.

- **Logic** as pseudocode, a **runtime flow** as a call tree, **UI** as a component tree (with the state and module boundaries that matter), a **refactor** as a shallow file tree, or **interactions** as a Mermaid sequence diagram.
- When the shape already exists and the point is what changed in it, draw the same view as a `diff`:

  ```diff
   on(save)
  -  write content
  +  if content is unchanged
  +    return cached result
  +  write new content
  ```

- Show the whole block instead when most of it is new, or when leaving lines out would hide who owns what or in which order it runs.

### Evidence: before and after

Show the change working, as a before and an after.

- **Best: screenshots**, for anything with a screen. That's the pr-proof skill: its sheets put before and after side by side, zoomed in on the change. Put a line above each sheet saying what to look at.
- **Good: something you ran.** The test that failed before and passes now (name it, or sketch it in pseudocode), or the command output before and after.
- **Not evidence:** "the checks pass" alone. List them, but they only prove nothing a test knew about broke.

### Merge danger: the door and the blast radius

- **Door:** two-way when merging can be walked back by reverting (most code), one-way when it can't: a data migration, a deleted record, a sent email, a published package, a renamed public URL or API. Say what makes it one-way, and for a High tier, what you tried, what you didn't, and how to undo what can be undone.
- **Blast radius:** one word for how far it reaches if it's wrong (`page`, `component`, `site`, `API consumers`, `everyone`), then the ways it could go wrong that a reviewer should check: layout shift, phone widths, other languages, consumers of a changed API, caches, SEO.

A one-way door or a wide blast radius is a reason to raise the tier with pr-risks.

## 6. Improve this skill

Before calling the work done, ask what this change taught, and fill in the PR's Skills line with it (or "nothing new"):

- **A bug got past the checks** (the review, the preview or a person found it): make it a check. Add a script or test to the project, show it fails on the old code, and add it to `checks` in `show-your-work.json`. If that's too big for this PR, open an issue and add a lesson that links it.
- **Something cost a retry or a workaround** the next agent will hit too: add a lesson with `bun $SKILL/scripts/lessons.ts add "<what to do>" --pr <number>`.
- **A person corrected how you work**, in a review or a message: add a lesson, in their words.
- **A lesson is now handled by a check or a step, or turned out wrong:** `bun $SKILL/scripts/lessons.ts drop <n>`.

Each lesson is one line about what to do, not the story of what went wrong. Where they're kept depends on `lessons` in `show-your-work.json`: in this clone only (`local`, the default), committed and reviewed in PRs (`commit`), or nowhere (`off`). With `commit`, `check.ts` fails when a skill has more than `maxLessons` (12), so the oldest have to become a check or a step. Don't edit this skill's own files for a project's lessons: an update replaces them. A fix that would help every project belongs upstream, in chanlito/skills.

## Settings

`show-your-work.json` at the repo root, all optional:

- `checks`: commands that must pass, in order, like `["npm run lint", "npm test", "npm run build"]`.
- `base`: the branch to compare with (`origin/main`).
- `branch.pattern`: what a branch name should look like (a warning). `branch.forbid`: names that fail, like `"^tmp/"`.
- `commits`: `"conventional"` (the default), `"gitmoji"` (`✨ feat(scope): message`), `"any"`, or a regular expression.
- `preview`: the preview deploy URL with `{branch}` as the branch name in dashes, like `"https://{branch}.my-app.pages.dev/"`.
- `template`: the PR template (`.github/pull_request_template.md`).
