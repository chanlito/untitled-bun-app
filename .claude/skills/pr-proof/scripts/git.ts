// Running commands, and what the scripts need to know from git.
//
// Shared by every skill in chanlito/skills: edit it in shared/ and run
// `bun run sync`.

import { spawnSync } from 'node:child_process';
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
