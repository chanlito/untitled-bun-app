// Everything to check before a push, in one go: the branch name, the commit
// subjects, that committed lessons stay under the cap, and the project's own
// checks from skills.config.ts ("checks"). Then it prints the risk tier and
// the preview link for the PR.
//
//   bun scripts/check.ts           stops at a bad branch name or commit first
//   bun scripts/check.ts --rerun   runs the checks even if this code passed
//
// The checks are slow, so they run only once the quick problems are fixed,
// and not again on code they already passed: a reworded commit doesn't
// change the code. Compares the branch with "base" (origin/main by default),
// so run `git fetch origin main` first if main has moved.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config';
import { branch, output, previewUrl, sh, subjects, treeHash } from './git';
import { lessonProblems } from './lessons';
import { printTier } from './tier';

const TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
const FORMATS: Record<string, { re: RegExp; example: string }> = {
  conventional: {
    re: new RegExp(`^(${TYPES})(\\([\\w./-]+\\))?!?: \\S`),
    example: 'type(scope): message',
  },
  // Some gitmojis are several joined together, like 🧑‍💻.
  gitmoji: {
    re: new RegExp(
      `^\\p{Extended_Pictographic}\\uFE0F?(\\u200D\\p{Extended_Pictographic}\\uFE0F?)*\\s(${TYPES})(\\([\\w./-]+\\))?!?: \\S`,
      'u',
    ),
    example: '<gitmoji> type(scope): message',
  },
  any: { re: /./, example: 'anything' },
};

const c = config();
const rerun = process.argv.includes('--rerun');
const problems: string[] = [];

function notReady(note = '') {
  console.log(`\n✗ Not ready to push:`);
  for (const p of problems) console.log(`  ${p}`);
  if (note) console.log(note);
  process.exit(1);
}

const name = branch();
if (c.branch.forbid && new RegExp(c.branch.forbid).test(name))
  problems.push(`branch "${name}" isn't allowed here: rename it`);
else if (c.branch.pattern && !new RegExp(c.branch.pattern).test(name))
  console.log(`! branch "${name}" doesn't match ${c.branch.pattern}`);

const format = FORMATS[c.commits] ?? {
  re: new RegExp(c.commits, 'u'),
  example: c.commits,
};
for (const subject of subjects())
  if (!format.re.test(subject))
    problems.push(`commit "${subject}": write it as "${format.example}"`);

problems.push(...lessonProblems());
if (problems.length)
  notReady('The checks did not run: fix these first, then run this again.');

// The code the checks last passed on, and the checks they were. Files git
// ignores (.env, node_modules) aren't part of it: after changing those,
// --rerun.
const passed = resolve(
  output(['git', 'rev-parse', '--git-path', 'skills/checks-passed']),
);
const tree = c.checks.length ? treeHash() : '';
if (c.checks.length && !tree)
  console.log("! git couldn't hash the code, so the checks always run.");
const stamp = JSON.stringify({ tree, checks: c.checks });
if (
  tree &&
  !rerun &&
  existsSync(passed) &&
  readFileSync(passed, 'utf8') === stamp
)
  console.log(
    '✓ The checks already passed on this exact code: skipped (--rerun runs them anyway).',
  );
else {
  for (const line of c.checks) {
    console.log(`\n$ ${line}`);
    if (sh(line) !== 0) problems.push(`${line} failed`);
  }
  // Only when the checks left the code as they found it: a check that
  // rewrites files (a formatter, codegen) passed on code that's gone now.
  if (tree && !problems.length) {
    if (treeHash() === tree) {
      mkdirSync(dirname(passed), { recursive: true });
      writeFileSync(passed, stamp);
    } else
      console.log(
        "! The checks changed files, so they'll run again next time. Commit or ignore what they write.",
      );
  }
}

console.log('');
printTier();
const preview = previewUrl(name);
if (preview) console.log(`Preview: ${preview}`);
if (c.lessons !== 'off')
  console.log('Learned something? Each skill ends with "Improve this skill".');
if (problems.length) notReady();
console.log('\n✓ Ready to push.');
