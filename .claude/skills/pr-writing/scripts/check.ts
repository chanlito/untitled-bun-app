// Everything to check before a push, in one go: the branch name, the commit
// subjects, the project's own checks from show-your-work.json ("checks"),
// and that committed lessons stay under the cap. Then it prints the risk
// tier and the preview link for the PR.
//
//   bun scripts/check.ts
//
// Compares the branch with "base" (origin/main by default), so run
// `git fetch origin main` first if main has moved.

import { config } from './config';
import { branch, previewUrl, sh, subjects } from './git';
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
const problems: string[] = [];

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

for (const line of c.checks) {
  console.log(`\n$ ${line}`);
  if (sh(line) !== 0) problems.push(`${line} failed`);
}

console.log('');
printTier();
const preview = previewUrl(name);
if (preview) console.log(`Preview: ${preview}`);
if (c.lessons !== 'off')
  console.log('Learned something? Each skill ends with "Improve this skill".');
if (problems.length) {
  console.log(`\n✗ Not ready to push:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\n✓ Ready to push.');
