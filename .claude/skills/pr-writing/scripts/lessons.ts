// A skill's lessons: one dated line each, about what to do differently,
// kept out of the skill itself so updating the skill never loses them.
//
//   bun scripts/lessons.ts             print this skill's lessons
//   bun scripts/lessons.ts add "<what to do>" [--pr 123]
//   bun scripts/lessons.ts drop <n>    delete lesson n (1 is the oldest)
//   bun scripts/lessons.ts path        where they're kept
//
// With "lessons": "local" (the default) they live inside .git, so they stay
// in this clone and never show up in a commit; past the cap the oldest goes.
// With "commit" they live in lessonsDir and get reviewed in PRs; past the
// cap `add` refuses, and the oldest have to become a check or a step first.
//
// Shared by every skill in chanlito/skills: edit it in shared/ and run
// `bun run sync`.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, root } from './config';
import { output } from './git';

/** This skill's name: the folder above scripts/. */
export const SKILL = basename(
  resolve(dirname(fileURLToPath(import.meta.url)), '..'),
);

/** The lessons file for a skill, or null when lessons are off. */
export function lessonsFile(skill = SKILL) {
  const { lessons, lessonsDir } = config();
  if (lessons === 'off') return null;
  if (lessons === 'commit') return join(root(), lessonsDir, `${skill}.md`);
  // Inside the shared .git folder, so every worktree of the clone sees them.
  const common = output(['git', 'rev-parse', '--git-common-dir']) || '.git';
  const git = isAbsolute(common) ? common : join(process.cwd(), common);
  return join(git, 'show-your-work', 'lessons', `${skill}.md`);
}

const isLesson = (line: string) => /^[-*]\s/.test(line);

export function readLessons(skill = SKILL) {
  const file = lessonsFile(skill);
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(isLesson);
}

function write(file: string, skill: string, lessons: string[]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `# Lessons for ${skill}\n\nOne line each, oldest first: the date, the PR, and what to do.\n\n${lessons.join('\n')}\n`,
  );
}

function add(text: string, pr?: string) {
  const file = lessonsFile();
  if (!file) {
    console.log('Lessons are off in show-your-work.json.');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const line = `- ${today}${pr ? ` (#${pr.replace(/^#/, '')})` : ''}: ${text.trim()}`;
  const lessons = [...readLessons(), line];
  const { lessons: mode, maxLessons } = config();
  if (lessons.length > maxLessons) {
    if (mode === 'commit') {
      console.error(
        `${SKILL} already has ${maxLessons} lessons. Turn the oldest into a check or a step, drop them, then add this one.`,
      );
      process.exit(1);
    }
    const gone = lessons.splice(0, lessons.length - maxLessons);
    for (const g of gone) console.log(`Dropped the oldest: ${g}`);
  }
  write(file, SKILL, lessons);
  console.log(`Added to ${file}:\n${line}`);
}

function drop(n: number) {
  const file = lessonsFile();
  const lessons = readLessons();
  if (!file || !(n >= 1 && n <= lessons.length)) {
    console.error(`There's no lesson ${n}.`);
    process.exit(1);
  }
  const [gone] = lessons.splice(n - 1, 1);
  write(file, SKILL, lessons);
  console.log(`Dropped: ${gone}`);
}

/** Problems with every skill's lessons, for the pre-push check. */
export function lessonProblems() {
  const { lessons: mode, maxLessons, lessonsDir } = config();
  if (mode !== 'commit') return [];
  const dir = join(root(), lessonsDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .map((skill) => ({ skill, count: readLessons(skill).length }))
    .filter((s) => s.count > maxLessons)
    .map(
      (s) =>
        `${s.skill} has ${s.count} lessons: turn the oldest into a check or a step (at most ${maxLessons})`,
    );
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('lessons.ts')) {
  const [command = 'show', ...rest] = process.argv.slice(2);
  if (command === 'path') console.log(lessonsFile() ?? 'Lessons are off.');
  else if (command === 'add') {
    const at = rest.indexOf('--pr');
    const pr = at >= 0 ? rest.splice(at, 2)[1] : undefined;
    if (!rest.length) {
      console.error('Usage: lessons.ts add "<what to do>" [--pr 123]');
      process.exit(1);
    }
    add(rest.join(' '), pr);
  } else if (command === 'drop') drop(Number(rest[0]));
  else {
    const lessons = readLessons();
    console.log(
      lessons.length
        ? lessons.map((l, i) => `${i + 1}. ${l.slice(2)}`).join('\n')
        : `No lessons for ${SKILL} yet.`,
    );
  }
}
