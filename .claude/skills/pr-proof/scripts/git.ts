// Running commands, and what the scripts need to know from git.
//
// Shared by every skill in chanlito/skills: edit it in shared/ and run
// `bun run sync`.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from './config';

/** Runs a command, streaming its output, and returns its exit code. */
export function run(cmd: string[], cwd = '.') {
  return spawnSync(cmd[0], cmd.slice(1), { cwd, stdio: 'inherit' }).status;
}

/** Runs a shell command line (from the config), streaming its output. */
export function sh(line: string, cwd = '.') {
  return spawnSync(line, { cwd, stdio: 'inherit', shell: true }).status;
}

/** Runs a command and returns what it printed, trimmed ('' if it isn't there). */
export function output(cmd: string[], cwd = '.') {
  return (
    spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8' }).stdout ?? ''
  ).trim();
}

export function branch() {
  return output(['git', 'branch', '--show-current']);
}

/** The branch name as a URL-safe slug: feat/paper-cursor is feat-paper-cursor. */
export function slug(name = branch()) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The branch's preview URL, or '' when the project has none. */
export function previewUrl(name = branch()) {
  return config().preview.replaceAll('{branch}', slug(name));
}

/** owner/name of the origin remote on GitHub, or ''. */
export function repo() {
  return output(['git', 'remote', 'get-url', 'origin'])
    .replace(/^.*github\.com[:/]/, '')
    .replace(/\.git$/, '');
}

/** Files this branch changes against the base, committed or not. */
export function changedFiles() {
  // Without renames, a moved file counts on both sides: moving deploy config
  // away is still a change to deploy config.
  const committed = output([
    'git',
    '-c',
    'core.quotePath=false',
    'diff',
    '--name-only',
    '--no-renames',
    `${config().base}...HEAD`,
  ]);
  const uncommitted = output([
    'git',
    '-c',
    'core.quotePath=false',
    'status',
    '--porcelain',
    '--untracked-files=all',
  ])
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => line.replace(/^.. ?/, '').split(' -> '));
  return [...new Set([...committed.split('\n'), ...uncommitted])].filter(
    Boolean,
  );
}

/**
 * A hash of the code as it is on disk, committed or not, with untracked
 * files and without ignored ones. It stays the same when only a commit
 * message changes, so a run can tell that nothing it checked has moved.
 * Works on a copy of the index, so what's staged stays as it is. '' when
 * git can't tell, which never matches anything.
 */
export function treeHash() {
  const index = resolve(output(['git', 'rev-parse', '--git-path', 'index']));
  const copy = join(tmpdir(), `skills-index-${process.pid}-${Date.now()}`);
  try {
    if (existsSync(index)) copyFileSync(index, copy);
    const env = { ...process.env, GIT_INDEX_FILE: copy };
    const add = spawnSync('git', ['add', '--all'], { env, stdio: 'ignore' });
    if (add.status !== 0) return '';
    const tree = spawnSync('git', ['write-tree'], { env, encoding: 'utf8' });
    return tree.status === 0 ? tree.stdout.trim() : '';
  } finally {
    rmSync(copy, { force: true });
  }
}

/** Commit subjects on this branch, without merges. */
export function subjects() {
  return output([
    'git',
    'log',
    '--no-merges',
    '--format=%s',
    `${config().base}..HEAD`,
  ])
    .split('\n')
    .filter(Boolean);
}
