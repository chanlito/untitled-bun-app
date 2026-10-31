---
name: pr-risks
description: Rank a change Low, Medium or High risk from what it touches, and run the reviews that tier calls for. Use before opening or updating a pull request, or when asked how risky a change is or how much review it needs.
---

# PR risks

Risk comes from what a change touches, not from who or what wrote it. The tier decides how much proof and review a pull request gets, so a typo fix doesn't wait on a security review and a change to sign-in doesn't merge on green checks alone.

In the commands below, `$SKILL` is this skill's folder (for example `.claude/skills/pr-risks`). Run them with bun from the repo's root.

## 1. Read the lessons

`bun $SKILL/scripts/lessons.ts` prints what earlier changes taught this skill in this project. Follow them.

## 2. Find the tier

```sh
bun $SKILL/scripts/risk.ts
```

It compares the branch with the base (`origin/main` unless `show-your-work.json` says otherwise), lists the files that set the tier, and names the reviews it gets. The highest tier any file calls for wins.

| Tier       | Usually                                                             | Proof                                                                              | Reviews (defaults)                                                   |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Low**    | docs and content only                                               | the pre-push checks                                                                | none                                                                 |
| **Medium** | most changes, and anything that changes how agents work (AGENTS.md) | checks, plus screenshots for anything with a screen (the pr-proof skill)           | code review, up to 2 rounds                                          |
| **High**   | deploy, CI, data, sign-in, payments                                 | checks, screenshots, and a note on what was tried, what wasn't, and how to undo it | code review up to 3 rounds, security review, a person reads the diff |

Then check what paths can't tell. A new sign-in, permission, payment, secret or outside service makes a change High, wherever it lives. Raise the tier when that applies, and never lower it below what the script says.

## 3. Run the reviews

- Review in a fresh context, not the session that wrote the change, so the reviewer isn't anchored on the author's reasoning.
- After round 1, review only what changed since.
- Problems in code the change didn't touch become issues, not part of this PR.
- If the last round still finds real problems, rethink the approach instead of patching again.
- An agent's approval never counts as a person's.

Record what each round found and what was fixed in the PR's Review section. Put the tier near the top of the PR with its one-line reason, and add the label (`risk:low`, `risk:medium` or `risk:high` by default). The pr-writing skill fills both in.

## 4. Improve this skill

Before calling the work done, ask what this change taught about risk:

- **The tier was wrong** (a path that should have been High, or a Low that needed review): fix the paths in `show-your-work.json` under `tiers`. That's a change to the project, so it goes in the PR.
- **A review missed something it should have caught**, or a step here was wrong, slow or missing: add a lesson with `bun $SKILL/scripts/lessons.ts add "<what to do>" --pr <number>`.
- **A person corrected how you rank or review:** add a lesson, in their words.
- **A lesson is now covered by the config or turned out wrong:** `bun $SKILL/scripts/lessons.ts drop <n>`.

Each lesson is one line about what to do, not the story of what went wrong. Where they're kept depends on `lessons` in `show-your-work.json`: in this clone only (`local`, the default), committed and reviewed in PRs (`commit`), or nowhere (`off`). A fix that would help every project belongs upstream, in chanlito/skills.

## Settings

`show-your-work.json` at the repo root, all optional:

- `base`: the branch to compare with.
- `tiers.high`, `tiers.medium`, `tiers.low`: globs. Anything not Low is Medium; `medium` lifts files that would otherwise be Low.
- `tiers.reasons`, `tiers.reviews`: the words for each tier.
- `tiers.label`: the label, with `{tier}`, or `""` for none.
